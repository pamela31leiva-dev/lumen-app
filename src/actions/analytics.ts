'use server';

import { getSupabaseServerClient } from '@/infrastructure/supabase/server';
import { detectRecurringObligations, hasTransactionOnDate } from '@/domain/analytics/patterns';
import type { ProactiveInsights, RecurringObligation } from '@/domain/types/analytics';

const LOOKBACK_MONTHS = 12;

/**
 * Motor de inteligencia proactiva: detecta obligaciones recurrentes vencidas
 * y si hubo actividad hoy. Solo analiza transacciones CONFIRMADAS (nunca
 * pendientes) para no construir sugerencias sobre datos sin validar.
 */
export async function getProactiveInsights(spaceId: string): Promise<ProactiveInsights> {
  const supabase = await getSupabaseServerClient();

  const lookbackDate = new Date();
  lookbackDate.setUTCMonth(lookbackDate.getUTCMonth() - LOOKBACK_MONTHS);

  const todayStart = new Date();
  todayStart.setUTCHours(0, 0, 0, 0);

  const [{ data: confirmedRows, error: confirmedError }, { data: todayRows, error: todayError }] = await Promise.all([
    supabase
      .from('transactions')
      .select('description, amount_original, type, transaction_date')
      .eq('space_id', spaceId)
      .eq('status', 'confirmed')
      .eq('type', 'expense')
      .gte('transaction_date', lookbackDate.toISOString())
      .order('transaction_date', { ascending: true }),
    supabase.from('transactions').select('transaction_date').eq('space_id', spaceId).gte('transaction_date', todayStart.toISOString()),
  ]);

  if (confirmedError) console.error('Error al leer historial para analitica:', confirmedError);
  if (todayError) console.error('Error al leer actividad de hoy:', todayError);

  const recurringObligations: RecurringObligation[] = detectRecurringObligations(
    (confirmedRows ?? []).map((row) => ({
      description: row.description,
      amountOriginal: Number(row.amount_original),
      type: row.type,
      transactionDate: row.transaction_date,
    })),
  );

  const hasActivityToday = hasTransactionOnDate((todayRows ?? []).map((row) => row.transaction_date));

  return { recurringObligations, hasActivityToday };
}

/**
 * El usuario confirma "si, ya paso" sobre una obligacion sugerida: crea una
 * transaccion pending_confirmation pre-llenada (monto/descripcion habituales)
 * para que la termine de revisar en la bandeja normal, igual que cualquier
 * otra captura — nunca se inserta directo como confirmed.
 */
export async function createPendingFromRecurringObligation(
  spaceId: string,
  obligation: RecurringObligation,
): Promise<{ success: true; transactionId: string } | { success: false; error: string }> {
  const supabase = await getSupabaseServerClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();
  if (authError || !user) {
    return { success: false, error: 'No autorizado' };
  }

  const { data: space, error: spaceError } = await supabase
    .from('spaces')
    .select('base_currency')
    .eq('id', spaceId)
    .single();
  if (spaceError || !space) {
    return { success: false, error: 'No tienes acceso a este espacio.' };
  }

  const { data, error } = await supabase
    .from('transactions')
    .insert({
      space_id: spaceId,
      type: 'expense',
      amount_original: obligation.averageAmount,
      currency_original: space.base_currency,
      exchange_rate: 1,
      source: 'manual',
      status: 'pending_confirmation',
      description: `(Sugerido) ${obligation.description}`,
      transaction_date: new Date().toISOString(),
      ai_raw_interpretation: { pattern: obligation },
      created_by: user.id,
    })
    .select('id')
    .single();

  if (error || !data) {
    console.error('Error al crear la obligacion recurrente sugerida:', error);
    return { success: false, error: 'No se pudo registrar el movimiento sugerido.' };
  }

  return { success: true, transactionId: data.id };
}
