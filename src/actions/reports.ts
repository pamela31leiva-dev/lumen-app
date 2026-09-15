'use server';

import { getSupabaseServerClient } from '@/infrastructure/supabase/server';

export interface MonthlyReportCategoryLine {
  categoryId: string;
  categoryName: string;
  total: number;
  budgetAmount: number | null;
  /** total/budgetAmount * 100, redondeado. null si la categoria no tiene presupuesto. */
  budgetPercent: number | null;
}

export interface MonthlyReport {
  monthStart: string;
  monthEnd: string;
  totalIncome: number;
  totalExpense: number;
  netFlow: number;
  categories: MonthlyReportCategoryLine[];
}

interface MonthlyReportJson {
  month_start: string;
  month_end: string;
  total_income: number;
  total_expense: number;
  net_flow: number;
  category_breakdown: {
    category_id: string;
    category_name: string;
    total: number;
    budget_amount: number | null;
  }[];
}

/**
 * Reporte mensual determinista (Bloque P3): ingresos, gastos y desglose por
 * categoria de gasto vs. su presupuesto (si tiene uno), calculado en
 * Postgres (get_monthly_report, 0028) sobre transacciones confirmadas. Solo
 * incluye categorias con actividad ese mes O con presupuesto asignado --
 * una categoria sin gasto ni presupuesto no aporta nada al reporte.
 */
export async function getMonthlyReport(spaceId: string, month?: string): Promise<MonthlyReport | { error: string }> {
  const supabase = await getSupabaseServerClient();

  const params: { p_space_id: string; p_month?: string } = { p_space_id: spaceId };
  if (month) params.p_month = month;

  const { data, error } = await supabase.rpc('get_monthly_report', params);

  if (error) {
    console.error('Error al generar el reporte mensual:', error);
    return { error: 'No se pudo generar el reporte de este mes.' };
  }

  const report = data as MonthlyReportJson;

  return {
    monthStart: report.month_start,
    monthEnd: report.month_end,
    totalIncome: Number(report.total_income),
    totalExpense: Number(report.total_expense),
    netFlow: Number(report.net_flow),
    categories: (report.category_breakdown ?? []).map((row) => ({
      categoryId: row.category_id,
      categoryName: row.category_name,
      total: Number(row.total),
      budgetAmount: row.budget_amount !== null ? Number(row.budget_amount) : null,
      budgetPercent: row.budget_amount ? Math.round((Number(row.total) / Number(row.budget_amount)) * 100) : null,
    })),
  };
}
