'use server';

import { getSupabaseServerClient } from '@/infrastructure/supabase/server';

export interface BillSummary {
  id: string;
  description: string;
  amount: number;
  currency: string;
  dueDate: string; // ISO 8601 (fecha, sin hora)
  /** Dias hasta el vencimiento; negativo si ya vencio. */
  daysUntilDue: number;
}

/**
 * Modulo de Facturas: obligaciones pendientes que el usuario ya sabe que
 * van a llegar (servicios publicos, recibos), a diferencia de
 * RecurringObligation que INFIERE patrones del historial ya confirmado.
 * Solo trae las que siguen 'pending' -- una vez pagada, deja de listarse
 * aqui (sigue existiendo en la tabla con status='paid' para trazabilidad).
 */
export async function getPendingBills(spaceId: string): Promise<BillSummary[]> {
  const supabase = await getSupabaseServerClient();

  const { data, error } = await supabase
    .from('bills')
    .select('id, description, amount, currency, due_date')
    .eq('space_id', spaceId)
    .eq('status', 'pending')
    .order('due_date', { ascending: true });

  if (error) {
    console.error('Error al leer facturas pendientes:', error);
    return [];
  }

  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);
  const DAY_MS = 86_400_000;

  return (data ?? []).map((row) => ({
    id: row.id,
    description: row.description,
    amount: Number(row.amount),
    currency: row.currency,
    dueDate: row.due_date,
    daysUntilDue: Math.round((new Date(row.due_date).getTime() - todayStart.getTime()) / DAY_MS),
  }));
}

/** Registra una factura/obligacion con fecha limite conocida. */
export async function createBill(
  spaceId: string,
  description: string,
  amount: number,
  currency: string,
  dueDate: string,
): Promise<{ success: true } | { success: false; error: string }> {
  const supabase = await getSupabaseServerClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();
  if (authError || !user) {
    return { success: false, error: 'No autorizado' };
  }

  const trimmedDescription = description.trim();
  if (!trimmedDescription) {
    return { success: false, error: 'Escribe una descripcion breve.' };
  }
  if (!Number.isFinite(amount) || amount <= 0) {
    return { success: false, error: 'El monto debe ser mayor que cero.' };
  }
  if (!dueDate) {
    return { success: false, error: 'Selecciona la fecha limite.' };
  }

  const { error } = await supabase.from('bills').insert({
    space_id: spaceId,
    description: trimmedDescription,
    amount,
    currency: currency || 'COP',
    due_date: dueDate,
    created_by: user.id,
  });

  if (error) {
    console.error('Error al registrar la factura:', error);
    return { success: false, error: 'No se pudo registrar la factura.' };
  }

  return { success: true };
}

/**
 * "Ya la pague": marca la factura como pagada Y crea una transaccion
 * pending_confirmation pre-llenada, igual que createPendingFromRecurringObligation
 * -- nunca se inserta directo como confirmed, el usuario sigue revisando en
 * la bandeja normal (cuenta/categoria) antes de que cuente para los saldos.
 */
export async function markBillPaid(
  spaceId: string,
  billId: string,
): Promise<{ success: true; transactionId: string } | { success: false; error: string }> {
  const supabase = await getSupabaseServerClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();
  if (authError || !user) {
    return { success: false, error: 'No autorizado' };
  }

  const { data: bill, error: billError } = await supabase
    .from('bills')
    .select('description, amount, currency, status')
    .eq('id', billId)
    .eq('space_id', spaceId)
    .single();

  if (billError || !bill) {
    return { success: false, error: 'No se encontro la factura.' };
  }
  if (bill.status === 'paid') {
    return { success: false, error: 'Esa factura ya esta marcada como pagada.' };
  }

  const { data: transaction, error: txError } = await supabase
    .from('transactions')
    .insert({
      space_id: spaceId,
      type: 'expense',
      amount_original: bill.amount,
      currency_original: bill.currency,
      exchange_rate: 1,
      source: 'manual',
      status: 'pending_confirmation',
      description: bill.description,
      transaction_date: new Date().toISOString(),
      created_by: user.id,
    })
    .select('id')
    .single();

  if (txError || !transaction) {
    console.error('Error al crear el movimiento desde la factura:', txError);
    return { success: false, error: 'No se pudo registrar el pago.' };
  }

  const { error: updateError } = await supabase
    .from('bills')
    .update({ status: 'paid', paid_at: new Date().toISOString() })
    .eq('id', billId)
    .eq('space_id', spaceId);

  if (updateError) {
    console.error('Error al marcar la factura como pagada:', updateError);
    // El movimiento ya quedo creado (lo importante para el usuario); esto
    // solo deja la factura visible una vez mas, no es un dato perdido.
  }

  return { success: true, transactionId: transaction.id };
}

/** Elimina una factura registrada por error. RLS exige owner/admin. */
export async function deleteBill(
  spaceId: string,
  billId: string,
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
    .from('bills')
    .delete({ count: 'exact' })
    .eq('id', billId)
    .eq('space_id', spaceId);

  if (error) {
    console.error('Error al eliminar la factura:', error);
    return { success: false, error: 'No se pudo eliminar la factura.' };
  }
  if (!count) {
    return { success: false, error: 'No tienes permiso para eliminar esta factura (requiere rol Owner o Admin).' };
  }

  return { success: true };
}
