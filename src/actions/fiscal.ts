'use server';

import { getSupabaseServerClient } from '@/infrastructure/supabase/server';
import { suggestTaxTreatment, type FiscalSummary, type TaxTreatment } from '@/domain/types/fiscal';
import type { SpaceType } from '@/domain/types/dashboard';

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

/**
 * Aplica la sugerencia estandar (ver suggestTaxTreatment) a toda categoria
 * de este espacio que TODAVIA no tenga clasificacion -- nunca pisa una
 * eleccion que la persona ya hizo a mano, sin importar si coincide o no con
 * lo que la sugerencia diria hoy. Un solo insert por lote en vez de N
 * llamadas a setCategoryFiscalTag.
 */
export async function applyStandardFiscalTags(spaceId: string): Promise<{ success: true; appliedCount: number } | { success: false; error: string }> {
  const supabase = await getSupabaseServerClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();
  if (authError || !user) return { success: false, error: 'No autorizado' };

  const [{ data: space }, { data: categories }, { data: existingTags }] = await Promise.all([
    supabase.from('spaces').select('type').eq('id', spaceId).single(),
    supabase.from('categories').select('id, kind').or(`space_id.eq.${spaceId},space_id.is.null`),
    supabase.from('category_fiscal_tags').select('category_id').eq('space_id', spaceId),
  ]);

  const spaceType = (space?.type as SpaceType | undefined) ?? 'personal';
  const alreadyTagged = new Set((existingTags ?? []).map((t) => t.category_id));

  const toInsert = (categories ?? [])
    .filter((c) => !alreadyTagged.has(c.id))
    .map((c) => ({
      space_id: spaceId,
      category_id: c.id,
      tax_treatment: suggestTaxTreatment(c.kind as 'income' | 'expense', spaceType),
      created_by: user.id,
    }));

  if (toInsert.length === 0) return { success: true, appliedCount: 0 };

  const { error } = await supabase.from('category_fiscal_tags').insert(toInsert);
  if (error) {
    console.error('Error al aplicar las sugerencias fiscales estandar:', error);
    return { success: false, error: 'No se pudieron aplicar las sugerencias. Intenta de nuevo.' };
  }

  return { success: true, appliedCount: toInsert.length };
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
