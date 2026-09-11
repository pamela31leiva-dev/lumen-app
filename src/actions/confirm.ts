'use server';

import { getSupabaseServerClient } from '@/infrastructure/supabase/server';
import type { ConfirmTransactionDTO, ConfirmTransactionResult } from '@/domain/types/capture';

type ServerClient = Awaited<ReturnType<typeof getSupabaseServerClient>>;

/**
 * "Cuenta" nunca debe bloquear el guardado (Cero Friccion): si no se eligio
 * ninguna, se usa la primera cuenta activa del espacio, y si el espacio no
 * tiene NINGUNA (deberia ser imposible desde 0012_default_account_per_space,
 * pero esto es la red de seguridad si esa migracion no ha corrido todavia o
 * alguien borro todas las cuentas), se crea una "Efectivo" al vuelo. La
 * resolucion completa vive en get_or_create_default_account (0018): un
 * select-luego-insert hecho aqui en JS podia crear dos cuentas "Efectivo" si
 * dos confirmaciones llegaban a la vez (doble tap en movil, dos pestañas);
 * la funcion en Postgres lo hace atomico via un indice unico parcial. Solo
 * aplica a income/expense: un transfer necesita dos cuentas reales y
 * distintas, elegidas a proposito -- auto-asignar ahi seria adivinar mal la
 * plata de alguien, no quitar friccion.
 */
async function resolveAccountId(
  supabase: ServerClient,
  spaceId: string,
  userId: string,
  requestedAccountId: string | null | undefined,
): Promise<string | null> {
  if (requestedAccountId) return requestedAccountId;

  const { data: space } = await supabase.from('spaces').select('base_currency').eq('id', spaceId).single();

  const { data: accountId, error } = await supabase.rpc('get_or_create_default_account', {
    p_space_id: spaceId,
    p_user_id: userId,
    p_currency: space?.base_currency ?? 'COP',
  });

  if (error) {
    console.error('Error al resolver la cuenta por defecto:', error);
    return null;
  }

  return accountId;
}

/**
 * La persona revisa y corrige lo que la IA propuso, y confirma. Esta es la
 * unica via para que una transaccion pase a status = 'confirmed' (la
 * constraint chk_confirmed_is_complete en la base de datos lo hace cumplir
 * incluso si esta funcion tuviera un bug).
 */
export async function confirmTransaction(payload: ConfirmTransactionDTO): Promise<ConfirmTransactionResult> {
  const supabase = await getSupabaseServerClient();

  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();
  if (authError || !user) {
    return { success: false, error: 'No autorizado' };
  }

  const accountId =
    payload.type === 'transfer' ? payload.account_id : await resolveAccountId(supabase, payload.space_id, user.id, payload.account_id);

  if (!accountId) {
    return { success: false, error: 'No se pudo asignar una cuenta. Intenta de nuevo.' };
  }
  if (payload.type === 'transfer' && !payload.destination_account_id) {
    return { success: false, error: 'Selecciona la cuenta destino.' };
  }

  const { data: transaction, error } = await supabase
    .from('transactions')
    .update({
      type: payload.type,
      account_id: accountId,
      destination_account_id: payload.type === 'transfer' ? (payload.destination_account_id ?? null) : null,
      category_id: payload.type === 'transfer' ? null : (payload.category_id ?? null),
      amount_original: payload.amount_original,
      currency_original: payload.currency_original,
      exchange_rate: payload.exchange_rate,
      description: payload.description ?? null,
      transaction_date: payload.transaction_date,
      tags: payload.tags ?? [],
      is_business: payload.is_business ?? false,
      life_domain: payload.is_business ? null : payload.life_domain ?? null,
      status: 'confirmed',
      confirmed_at: new Date().toISOString(),
      confirmed_by: user.id,
    })
    .eq('id', payload.transaction_id)
    .eq('space_id', payload.space_id)
    .select()
    .single();

  if (error) {
    console.error('Error al confirmar la transaccion:', error);
    return { success: false, error: 'No se pudo confirmar el movimiento. Revisa que todos los campos requeridos esten completos.' };
  }

  if (payload.receipt_id) {
    await supabase
      .from('receipts')
      .update({ status: 'confirmed' })
      .eq('id', payload.receipt_id)
      .eq('space_id', payload.space_id);
  }

  return { success: true, transaction };
}

/**
 * Descarta una propuesta de IA que el usuario determina que no corresponde a
 * un movimiento real (duplicado, ruido de OCR, etc). No se elimina la fila:
 * queda como `rejected` para trazabilidad, igual que exige el motor de confianza.
 */
export async function rejectPendingTransaction(
  transactionId: string,
  spaceId: string,
): Promise<{ success: true } | { success: false; error: string }> {
  const supabase = await getSupabaseServerClient();

  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();
  if (authError || !user) {
    return { success: false, error: 'No autorizado' };
  }

  const { error } = await supabase
    .from('transactions')
    .update({ status: 'rejected', confirmed_by: user.id, confirmed_at: new Date().toISOString() })
    .eq('id', transactionId)
    .eq('space_id', spaceId)
    .eq('status', 'pending_confirmation');

  if (error) {
    console.error('Error al rechazar la transaccion:', error);
    return { success: false, error: 'No se pudo descartar el movimiento.' };
  }

  return { success: true };
}

/**
 * Elimina definitivamente un registro (gasto, ingreso o transferencia) del
 * historial. A diferencia de rejectPendingTransaction (que descarta una
 * propuesta de IA sin confirmar), esto borra una fila real -- confirmada o
 * no. La fila SI queda en audit_logs (trigger trg_transactions_audit, ver
 * 0001_init_schema.sql) para trazabilidad, aunque desaparezca del historial
 * visible. Solo owner/admin pueden hacerlo (policy transactions_delete_admin);
 * un editor recibira un error de permisos aqui mismo, RLS lo hace cumplir.
 */
export async function deleteTransaction(
  transactionId: string,
  spaceId: string,
): Promise<{ success: true } | { success: false; error: string }> {
  const supabase = await getSupabaseServerClient();

  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();
  if (authError || !user) {
    return { success: false, error: 'No autorizado' };
  }

  const { error, count } = await supabase
    .from('transactions')
    .delete({ count: 'exact' })
    .eq('id', transactionId)
    .eq('space_id', spaceId);

  if (error) {
    console.error('Error al eliminar la transaccion:', error);
    return { success: false, error: 'No se pudo eliminar el movimiento.' };
  }

  if (!count) {
    return { success: false, error: 'No tienes permiso para eliminar este movimiento (requiere rol Owner o Admin).' };
  }

  return { success: true };
}

/**
 * Recategorizacion retroactiva en lote: corrige la categoria de N
 * movimientos CONFIRMADOS de una sola vez, en vez de abrir cada uno por
 * separado. category_id=null es valido (quita la categoria). Nunca toca
 * pendientes -- eso ya se corrige en el flujo normal de confirmacion.
 */
export async function bulkUpdateCategory(
  transactionIds: string[],
  spaceId: string,
  categoryId: string | null,
): Promise<{ success: true; updatedCount: number } | { success: false; error: string }> {
  const supabase = await getSupabaseServerClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();
  if (authError || !user) {
    return { success: false, error: 'No autorizado' };
  }
  if (transactionIds.length === 0) {
    return { success: false, error: 'Selecciona al menos un movimiento.' };
  }

  const { error, count } = await supabase
    .from('transactions')
    .update({ category_id: categoryId }, { count: 'exact' })
    .eq('space_id', spaceId)
    .eq('status', 'confirmed')
    .in('id', transactionIds);

  if (error) {
    console.error('Error al recategorizar en lote:', error);
    return { success: false, error: 'No se pudo actualizar la categoria de esos movimientos.' };
  }

  return { success: true, updatedCount: count ?? 0 };
}

/**
 * Borrado en lote -- mismo permiso que deleteTransaction (RLS
 * transactions_delete_admin: solo owner/admin), aplicado a varias filas de
 * una vez para eliminar la friccion de confirmar una por una.
 */
export async function bulkDeleteTransactions(
  transactionIds: string[],
  spaceId: string,
): Promise<{ success: true; deletedCount: number } | { success: false; error: string }> {
  const supabase = await getSupabaseServerClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();
  if (authError || !user) {
    return { success: false, error: 'No autorizado' };
  }
  if (transactionIds.length === 0) {
    return { success: false, error: 'Selecciona al menos un movimiento.' };
  }

  const { error, count } = await supabase
    .from('transactions')
    .delete({ count: 'exact' })
    .eq('space_id', spaceId)
    .in('id', transactionIds);

  if (error) {
    console.error('Error al eliminar en lote:', error);
    return { success: false, error: 'No se pudieron eliminar esos movimientos.' };
  }
  if (!count) {
    return { success: false, error: 'No tienes permiso para eliminar estos movimientos (requiere rol Owner o Admin).' };
  }

  return { success: true, deletedCount: count };
}

/**
 * Mueve una transaccion PENDIENTE al espacio que la IA sugirio (ver
 * suggested_space_name en AiExtractionResult) cuando el texto claramente
 * pertenecia a otro contexto del usuario. Solo aplica a pendientes: mover
 * una CONFIRMADA de espacio complicaria saldos ya calculados y no es lo que
 * pide este flujo (evitar friccion justo al capturar, no reclasificar
 * historia). Se resetean cuenta/categoria porque pertenecen al espacio
 * original y no tienen por que existir en el destino; el receipt (si hay)
 * se mueve junto para que el trigger de consistencia de espacio no falle.
 * RLS exige rol editor+ en AMBOS espacios (origen y destino).
 */
export async function moveTransactionToSpace(
  transactionId: string,
  fromSpaceId: string,
  toSpaceId: string,
): Promise<{ success: true } | { success: false; error: string }> {
  const supabase = await getSupabaseServerClient();

  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();
  if (authError || !user) {
    return { success: false, error: 'No autorizado' };
  }

  const { data: transaction, error: fetchError } = await supabase
    .from('transactions')
    .select('receipt_id, status')
    .eq('id', transactionId)
    .eq('space_id', fromSpaceId)
    .single();

  if (fetchError || !transaction) {
    return { success: false, error: 'No se encontro el movimiento.' };
  }
  if (transaction.status !== 'pending_confirmation') {
    return { success: false, error: 'Solo se pueden mover movimientos pendientes de confirmar.' };
  }

  if (transaction.receipt_id) {
    const { error: receiptMoveError } = await supabase
      .from('receipts')
      .update({ space_id: toSpaceId })
      .eq('id', transaction.receipt_id)
      .eq('space_id', fromSpaceId);
    if (receiptMoveError) {
      console.error('Error al mover el documento fuente:', receiptMoveError);
      return { success: false, error: 'No tienes permiso para mover movimientos a ese espacio.' };
    }
  }

  const { error, count } = await supabase
    .from('transactions')
    .update({ space_id: toSpaceId, account_id: null, category_id: null }, { count: 'exact' })
    .eq('id', transactionId)
    .eq('space_id', fromSpaceId);

  if (error) {
    console.error('Error al mover la transaccion de espacio:', error);
    return { success: false, error: 'No se pudo mover el movimiento a ese espacio.' };
  }
  if (!count) {
    return { success: false, error: 'No tienes permiso para mover movimientos a ese espacio.' };
  }

  return { success: true };
}
