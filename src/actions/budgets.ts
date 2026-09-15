'use server';

import { getSupabaseServerClient } from '@/infrastructure/supabase/server';

export interface BudgetSummary {
  id: string;
  categoryId: string;
  categoryName: string;
  monthlyAmount: number;
}

/** Presupuestos del espacio, con el nombre de categoria ya resuelto -- para la pantalla de gestion en Ajustes y para el reporte mensual. */
export async function getBudgets(spaceId: string): Promise<BudgetSummary[]> {
  const supabase = await getSupabaseServerClient();

  const { data, error } = await supabase
    .from('budgets')
    .select('id, category_id, monthly_amount, category:categories(name)')
    .eq('space_id', spaceId)
    .order('created_at', { ascending: false })
    .returns<{ id: string; category_id: string; monthly_amount: number; category: { name: string } | null }[]>();

  if (error) {
    console.error('Error al leer los presupuestos:', error);
    return [];
  }

  return (data ?? []).map((row) => ({
    id: row.id,
    categoryId: row.category_id,
    categoryName: row.category?.name ?? '(categoria eliminada)',
    monthlyAmount: Number(row.monthly_amount),
  }));
}

function validateMonthlyAmount(monthlyAmount: number): string | null {
  if (!Number.isFinite(monthlyAmount) || monthlyAmount <= 0) return 'El presupuesto debe ser mayor que cero.';
  return null;
}

/**
 * Crea o reemplaza el presupuesto de una categoria (una sola fila por
 * espacio+categoria, ver unique en 0028) -- asignar un nuevo monto a una
 * categoria que ya tenia presupuesto simplemente lo actualiza, en vez de
 * duplicarlo.
 */
export async function setBudget(spaceId: string, categoryId: string, monthlyAmount: number): Promise<{ success: true } | { success: false; error: string }> {
  const supabase = await getSupabaseServerClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();
  if (authError || !user) return { success: false, error: 'No autorizado' };

  const validationError = validateMonthlyAmount(monthlyAmount);
  if (validationError) return { success: false, error: validationError };

  const { error } = await supabase
    .from('budgets')
    .upsert(
      { space_id: spaceId, category_id: categoryId, monthly_amount: monthlyAmount, created_by: user.id },
      { onConflict: 'space_id,category_id' },
    );

  if (error) {
    console.error('Error al guardar el presupuesto:', error);
    return { success: false, error: 'No se pudo guardar el presupuesto.' };
  }

  return { success: true };
}

/** Elimina el presupuesto de una categoria (vuelve a quedar sin limite). RLS exige owner/admin. */
export async function deleteBudget(spaceId: string, budgetId: string): Promise<{ success: true } | { success: false; error: string }> {
  const supabase = await getSupabaseServerClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();
  if (authError || !user) return { success: false, error: 'No autorizado' };

  const { error, count } = await supabase.from('budgets').delete({ count: 'exact' }).eq('id', budgetId).eq('space_id', spaceId);

  if (error) {
    console.error('Error al eliminar el presupuesto:', error);
    return { success: false, error: 'No se pudo eliminar el presupuesto.' };
  }
  if (!count) return { success: false, error: 'No tienes permiso para eliminar este presupuesto (requiere rol Owner o Admin).' };

  return { success: true };
}
