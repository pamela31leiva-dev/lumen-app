'use server';

import { getSupabaseServerClient } from '@/infrastructure/supabase/server';
import type { FinancialHistoryPoint } from '@/domain/types/analytics';

interface FinancialHistoryRow {
  period_start: string;
  assets: number;
  liabilities: number;
  net_worth: number;
  income: number;
  expense: number;
}

/**
 * Historia financiera mensual determinista (Bloque P3): activos, pasivos y
 * patrimonio neto a fin de cada mes, mas ingreso/gasto de ese mes -- todo
 * calculado en Postgres (get_financial_history, 0028) desde el ledger de
 * transacciones confirmadas, nunca estimado. Se pide aparte del snapshot
 * atomico del tablero (get_executive_board_snapshot) porque cambia con
 * frecuencia distinta y no todas las pantallas la necesitan.
 */
export async function getFinancialHistory(spaceId: string, periods: number = 12): Promise<FinancialHistoryPoint[]> {
  const supabase = await getSupabaseServerClient();

  const { data, error } = await supabase.rpc('get_financial_history', { p_space_id: spaceId, p_periods: periods });

  if (error) {
    console.error('Error al leer la historia financiera:', error);
    return [];
  }

  return ((data ?? []) as FinancialHistoryRow[]).map((row) => ({
    periodStart: row.period_start,
    assets: Number(row.assets),
    liabilities: Number(row.liabilities),
    netWorth: Number(row.net_worth),
    income: Number(row.income),
    expense: Number(row.expense),
  }));
}
