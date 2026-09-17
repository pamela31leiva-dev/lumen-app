'use server';

import { getSupabaseServerClient } from '@/infrastructure/supabase/server';
import { getExchangeRate } from '@/actions/currency';

export interface BudgetSummary {
  id: string;
  categoryId: string;
  categoryName: string;
  /** Monto tal como la persona lo escribio, en `currency`. */
  monthlyAmount: number;
  /** Moneda del presupuesto -- por defecto la moneda base del espacio (0032). */
  currency: string;
  /** monthlyAmount ya convertido a la moneda base del espacio (columna generada) -- lo que realmente se compara contra el gasto. */
  monthlyAmountBase: number;
}

/** Presupuestos del espacio, con el nombre de categoria ya resuelto -- para la pantalla de gestion en Ajustes y para el reporte mensual. */
export async function getBudgets(spaceId: string): Promise<BudgetSummary[]> {
  const supabase = await getSupabaseServerClient();

  const { data, error } = await supabase
    .from('budgets')
    .select('id, category_id, monthly_amount, currency, monthly_amount_base, category:categories(name)')
    .eq('space_id', spaceId)
    .order('created_at', { ascending: false })
    .returns<
      { id: string; category_id: string; monthly_amount: number; currency: string; monthly_amount_base: number; category: { name: string } | null }[]
    >();

  if (error) {
    console.error('Error al leer los presupuestos:', error);
    return [];
  }

  return (data ?? []).map((row) => ({
    id: row.id,
    categoryId: row.category_id,
    categoryName: row.category?.name ?? '(categoria eliminada)',
    monthlyAmount: Number(row.monthly_amount),
    currency: row.currency,
    monthlyAmountBase: Number(row.monthly_amount_base),
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
 *
 * currency es opcional (Bloque P7): si se omite o coincide con la moneda base
 * del espacio, fx_rate queda en 1 sin ninguna consulta de FX -- el caso comun,
 * sin friccion. Si es distinta, se busca la tasa del dia (getExchangeRate) y
 * se guarda junto con el monto: monthly_amount_base queda fijo desde ese
 * momento, igual que exchange_rate en una transaccion, no se recalcula solo
 * cada vez que cambian las tasas.
 */
export async function setBudget(
  spaceId: string,
  categoryId: string,
  monthlyAmount: number,
  currency?: string,
): Promise<{ success: true } | { success: false; error: string }> {
  const supabase = await getSupabaseServerClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();
  if (authError || !user) return { success: false, error: 'No autorizado' };

  const validationError = validateMonthlyAmount(monthlyAmount);
  if (validationError) return { success: false, error: validationError };

  const { data: space } = await supabase.from('spaces').select('base_currency').eq('id', spaceId).single();
  const baseCurrency = space?.base_currency ?? 'COP';
  const normalizedCurrency = (currency ?? baseCurrency).trim().toUpperCase();

  let fxRate = 1;
  if (normalizedCurrency !== baseCurrency) {
    const lookup = await getExchangeRate(normalizedCurrency, baseCurrency);
    if (!lookup.success) return { success: false, error: lookup.error };
    fxRate = lookup.data.rate;
  }

  const { error } = await supabase
    .from('budgets')
    .upsert(
      { space_id: spaceId, category_id: categoryId, monthly_amount: monthlyAmount, currency: normalizedCurrency, fx_rate: fxRate, created_by: user.id },
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
