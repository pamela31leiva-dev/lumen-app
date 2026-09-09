'use server';

import { getSupabaseServerClient } from '@/infrastructure/supabase/server';
import type { ConfirmTransactionDTO, ConfirmTransactionResult } from '@/domain/types/capture';

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

  const { data: transaction, error } = await supabase
    .from('transactions')
    .update({
      type: payload.type,
      account_id: payload.account_id,
      destination_account_id: payload.type === 'transfer' ? (payload.destination_account_id ?? null) : null,
      category_id: payload.type === 'transfer' ? null : (payload.category_id ?? null),
      amount_original: payload.amount_original,
      currency_original: payload.currency_original,
      exchange_rate: payload.exchange_rate,
      description: payload.description ?? null,
      transaction_date: payload.transaction_date,
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
