'use server';

import { getSupabaseServerClient } from '@/infrastructure/supabase/server';
import { folderToColumns, type Folder } from '@/domain/folders';

export interface RecurringIncomeSummary {
  id: string;
  description: string;
  amount: number;
  currency: string;
  folder: Folder;
  annualAdjustmentPercent: number | null;
  adjustmentMonth: number;
  isActive: boolean;
  /** Primer dia del mes ya generado; null si todavia no se ha generado ninguna transaccion. */
  lastGeneratedPeriod: string | null;
}

/**
 * Ingresos Recurrentes con Ajuste Anual: se registra UNA vez (pension,
 * salario) y generate_due_recurring_incomes (0019) crea la transaccion
 * pending_confirmation del mes automaticamente -- nunca hace falta volver a
 * teclearla. El ajuste anual es opcional: si se configura, compone sobre el
 * monto guardado una sola vez por año, a partir del mes elegido.
 */
export async function createRecurringIncome(
  spaceId: string,
  description: string,
  amount: number,
  currency: string,
  folder: Folder,
  annualAdjustmentPercent: number | null,
  adjustmentMonth: number,
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
    return { success: false, error: 'Escribe una descripcion breve (ej. Pension, Salario).' };
  }
  if (!Number.isFinite(amount) || amount <= 0) {
    return { success: false, error: 'El monto debe ser mayor que cero.' };
  }
  if (annualAdjustmentPercent !== null && (!Number.isFinite(annualAdjustmentPercent) || Math.abs(annualAdjustmentPercent) > 100)) {
    return { success: false, error: 'El ajuste anual debe estar entre -100% y 100%.' };
  }
  if (!Number.isInteger(adjustmentMonth) || adjustmentMonth < 1 || adjustmentMonth > 12) {
    return { success: false, error: 'Elige un mes valido para el ajuste anual.' };
  }

  const { error } = await supabase.from('recurring_incomes').insert({
    space_id: spaceId,
    description: trimmedDescription,
    amount,
    currency: currency || 'COP',
    annual_adjustment_percent: annualAdjustmentPercent,
    adjustment_month: adjustmentMonth,
    created_by: user.id,
    ...folderToColumns(folder),
  });

  if (error) {
    console.error('Error al registrar el ingreso recurrente:', error);
    return { success: false, error: 'No se pudo registrar el ingreso fijo.' };
  }

  return { success: true };
}

/** Pausa/reactiva un ingreso fijo sin perder su historial (ej. pension suspendida temporalmente). */
export async function toggleRecurringIncomeActive(
  spaceId: string,
  recurringIncomeId: string,
  isActive: boolean,
): Promise<{ success: true } | { success: false; error: string }> {
  const supabase = await getSupabaseServerClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();
  if (authError || !user) {
    return { success: false, error: 'No autorizado' };
  }

  const { error } = await supabase
    .from('recurring_incomes')
    .update({ is_active: isActive })
    .eq('id', recurringIncomeId)
    .eq('space_id', spaceId);

  if (error) {
    console.error('Error al pausar/reactivar el ingreso recurrente:', error);
    return { success: false, error: 'No se pudo actualizar el ingreso fijo.' };
  }

  return { success: true };
}

/** Elimina un ingreso fijo registrado por error. Las transacciones ya generadas no se tocan. */
export async function deleteRecurringIncome(
  spaceId: string,
  recurringIncomeId: string,
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
    .from('recurring_incomes')
    .delete({ count: 'exact' })
    .eq('id', recurringIncomeId)
    .eq('space_id', spaceId);

  if (error) {
    console.error('Error al eliminar el ingreso recurrente:', error);
    return { success: false, error: 'No se pudo eliminar el ingreso fijo.' };
  }
  if (!count) {
    return { success: false, error: 'No tienes permiso para eliminar este ingreso fijo (requiere rol Owner o Admin).' };
  }

  return { success: true };
}
