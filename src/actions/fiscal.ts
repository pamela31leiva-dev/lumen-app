'use server';

import { getSupabaseServerClient } from '@/infrastructure/supabase/server';
import type { FiscalSummary, TaxTreatment } from '@/domain/types/fiscal';

interface FiscalSummaryJson {
  year: number;
  income_gravado: number;
  income_exento: number;
  income_no_gravado: number;
  income_unclassified: number;
  expense_deducible: number;
  expense_no_deducible: number;
  expense_unclassified: number;
  withholding_tax_total: number;
  monthly: {
    month: number;
    income_gravado: number;
    income_exento: number;
    income_no_gravado: number;
    expense_deducible: number;
    expense_no_deducible: number;
    withholding_tax_total: number;
  }[];
}

/**
 * Resumen fiscal anual + mensual (Bloque P5): todo el numero viene de
 * get_fiscal_summary (0030), que solo suma lo que la persona ya clasifico
 * (category_fiscal_tags) y las retenciones que ya declaro por movimiento --
 * esta funcion unicamente traduce el JSON a camelCase, ningun calculo vive aqui.
 */
export async function getFiscalSummary(spaceId: string, year?: number): Promise<FiscalSummary> {
  const supabase = await getSupabaseServerClient();

  const params: { p_space_id: string; p_year?: number } = { p_space_id: spaceId };
  if (year) params.p_year = year;

  const { data, error } = await supabase.rpc('get_fiscal_summary', params);

  const empty: FiscalSummary = {
    year: year ?? new Date().getFullYear(),
    incomeGravado: 0,
    incomeExento: 0,
    incomeNoGravado: 0,
    incomeUnclassified: 0,
    expenseDeducible: 0,
    expenseNoDeducible: 0,
    expenseUnclassified: 0,
    withholdingTaxTotal: 0,
    monthly: [],
  };

  if (error || !data) {
    console.error('Error al leer el resumen fiscal:', error);
    return empty;
  }

  const json = data as FiscalSummaryJson;

  return {
    year: json.year,
    incomeGravado: Number(json.income_gravado),
    incomeExento: Number(json.income_exento),
    incomeNoGravado: Number(json.income_no_gravado),
    incomeUnclassified: Number(json.income_unclassified),
    expenseDeducible: Number(json.expense_deducible),
    expenseNoDeducible: Number(json.expense_no_deducible),
    expenseUnclassified: Number(json.expense_unclassified),
    withholdingTaxTotal: Number(json.withholding_tax_total),
    monthly: (json.monthly ?? []).map((row) => ({
      month: row.month,
      incomeGravado: Number(row.income_gravado),
      incomeExento: Number(row.income_exento),
      incomeNoGravado: Number(row.income_no_gravado),
      expenseDeducible: Number(row.expense_deducible),
      expenseNoDeducible: Number(row.expense_no_deducible),
      withholdingTaxTotal: Number(row.withholding_tax_total),
    })),
  };
}

export interface CategoryFiscalTagSummary {
  id: string;
  categoryId: string;
  taxTreatment: TaxTreatment;
}

/** Etiquetas fiscales ya asignadas en este espacio (una por categoria, ver unique en 0030). */
export async function getCategoryFiscalTags(spaceId: string): Promise<CategoryFiscalTagSummary[]> {
  const supabase = await getSupabaseServerClient();

  const { data, error } = await supabase
    .from('category_fiscal_tags')
    .select('id, category_id, tax_treatment')
    .eq('space_id', spaceId);

  if (error) {
    console.error('Error al leer las etiquetas fiscales:', error);
    return [];
  }

  return (data ?? []).map((row) => ({ id: row.id, categoryId: row.category_id, taxTreatment: row.tax_treatment as TaxTreatment }));
}

/** Crea o reemplaza la etiqueta fiscal de una categoria (una fila por espacio+categoria). */
export async function setCategoryFiscalTag(
  spaceId: string,
  categoryId: string,
  taxTreatment: TaxTreatment,
): Promise<{ success: true } | { success: false; error: string }> {
  const supabase = await getSupabaseServerClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();
  if (authError || !user) return { success: false, error: 'No autorizado' };

  const { error } = await supabase
    .from('category_fiscal_tags')
    .upsert(
      { space_id: spaceId, category_id: categoryId, tax_treatment: taxTreatment, created_by: user.id },
      { onConflict: 'space_id,category_id' },
    );

  if (error) {
    console.error('Error al guardar la etiqueta fiscal:', error);
    return { success: false, error: 'No se pudo guardar la clasificacion fiscal.' };
  }

  return { success: true };
}

/** Quita la etiqueta fiscal de una categoria (vuelve a quedar "sin clasificar"). RLS exige owner/admin. */
export async function deleteCategoryFiscalTag(spaceId: string, tagId: string): Promise<{ success: true } | { success: false; error: string }> {
  const supabase = await getSupabaseServerClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();
  if (authError || !user) return { success: false, error: 'No autorizado' };

  const { error, count } = await supabase.from('category_fiscal_tags').delete({ count: 'exact' }).eq('id', tagId).eq('space_id', spaceId);

  if (error) {
    console.error('Error al quitar la etiqueta fiscal:', error);
    return { success: false, error: 'No se pudo quitar la clasificacion fiscal.' };
  }
  if (!count) return { success: false, error: 'No tienes permiso para quitar esta clasificacion (requiere rol Owner o Admin).' };

  return { success: true };
}
