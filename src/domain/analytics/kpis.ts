import type { FinancialHistoryPoint, FinancialKpis } from '@/domain/types/analytics';

/**
 * KPIs y comparativas sobre la Historia Financiera (Bloque P3). Postgres
 * (get_financial_history, 0028) ya sumo activos/pasivos/ingreso/gasto por
 * mes desde el ledger de transacciones confirmadas; estas funciones son
 * puras y solo derivan razones/porcentajes o reagrupan esa serie -- ninguna
 * consulta a Supabase vive aqui, mismo principio que patterns.ts.
 */

const RECENT_MONTHS_FOR_LIQUIDITY = 3;

/**
 * Tasa de ahorro, colchon de liquidez (en meses de gasto) y ratio de
 * endeudamiento, calculados sobre el mes mas reciente de la serie (el ultimo
 * elemento -- get_financial_history siempre devuelve los meses en orden
 * ascendente). Cada KPI es independiente: uno puede ser null sin invalidar
 * los otros dos.
 */
export function computeFinancialKpis(history: FinancialHistoryPoint[]): FinancialKpis {
  if (history.length === 0) {
    return { savingsRatePercent: null, liquidityMonths: null, debtRatioPercent: null };
  }

  const latest = history[history.length - 1];

  const savingsRatePercent = latest.income > 0 ? roundTo((latest.income - latest.expense) / latest.income) : null;

  const recentExpenses = history.slice(-RECENT_MONTHS_FOR_LIQUIDITY).map((h) => h.expense).filter((e) => e > 0);
  const averageExpense = recentExpenses.length > 0 ? recentExpenses.reduce((sum, e) => sum + e, 0) / recentExpenses.length : 0;
  const liquidityMonths = averageExpense > 0 ? Math.round((latest.assets / averageExpense) * 10) / 10 : null;

  const debtRatioPercent = latest.assets > 0 ? roundTo(latest.liabilities / latest.assets) : latest.liabilities > 0 ? null : 0;

  return { savingsRatePercent, liquidityMonths, debtRatioPercent };
}

function roundTo(ratio: number): number {
  return Math.round(ratio * 1000) / 10; // ratio (0..1) -> porcentaje con un decimal
}

function quarterKey(isoDate: string): string {
  const d = new Date(isoDate);
  const quarter = Math.floor(d.getUTCMonth() / 3) + 1;
  return `${d.getUTCFullYear()}-Q${quarter}`;
}

/**
 * Reagrupa una serie mensual en trimestres: activos/pasivos/patrimonio neto
 * toman el valor de FIN del trimestre (son saldos a un punto en el tiempo,
 * no se suman), mientras que ingreso/gasto SI se suman (son flujos del
 * periodo completo). periodStart del punto resultante es el del ultimo mes
 * de cada trimestre, para que la fecha mostrada sea siempre la mas reciente
 * de ese grupo.
 */
export function resampleQuarterly(history: FinancialHistoryPoint[]): FinancialHistoryPoint[] {
  const groups = new Map<string, FinancialHistoryPoint[]>();
  for (const point of history) {
    const key = quarterKey(point.periodStart);
    const list = groups.get(key) ?? [];
    list.push(point);
    groups.set(key, list);
  }

  return Array.from(groups.values()).map((points) => {
    const last = points[points.length - 1];
    return {
      periodStart: last.periodStart,
      assets: last.assets,
      liabilities: last.liabilities,
      netWorth: last.netWorth,
      income: points.reduce((sum, p) => sum + p.income, 0),
      expense: points.reduce((sum, p) => sum + p.expense, 0),
    };
  });
}
