'use server';

import { getSupabaseServerClient } from '@/infrastructure/supabase/server';

export interface YearlySummary {
  year: number;
  totalIncome: number;
  totalExpense: number;
  netFlow: number;
}

/**
 * "Panorama Historico": totales por año calendario sobre transacciones
 * CONFIRMADAS (amount_base, ya en moneda base del espacio -- nunca se
 * convierte ni se inventa una tasa). Un año por fila para comparar de un
 * vistazo, mas reciente primero. Deliberadamente sin limite de años hacia
 * atras: son datos ya confirmados, agregarlos no tiene costo de confianza.
 */
export async function getYearlyOverview(spaceId: string): Promise<YearlySummary[]> {
  const supabase = await getSupabaseServerClient();

  const { data, error } = await supabase
    .from('transactions')
    .select('type, amount_base, transaction_date')
    .eq('space_id', spaceId)
    .eq('status', 'confirmed');

  if (error) {
    console.error('Error al leer historico anual:', error);
    return [];
  }

  const totalsByYear = new Map<number, YearlySummary>();
  for (const row of data ?? []) {
    const year = new Date(row.transaction_date).getFullYear();
    const current = totalsByYear.get(year) ?? { year, totalIncome: 0, totalExpense: 0, netFlow: 0 };
    const amount = Number(row.amount_base);
    if (row.type === 'income') {
      current.totalIncome += amount;
      current.netFlow += amount;
    } else if (row.type === 'expense') {
      current.totalExpense += amount;
      current.netFlow -= amount;
    }
    totalsByYear.set(year, current);
  }

  return Array.from(totalsByYear.values()).sort((a, b) => b.year - a.year);
}
