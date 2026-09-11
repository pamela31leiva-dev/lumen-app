'use server';

import { getSupabaseServerClient } from '@/infrastructure/supabase/server';

/**
 * Declara el saldo inicial "real" de una cuenta -- el dinero que ya existia
 * antes de que Lumen empezara a llevar el registro. Es la unica forma de
 * que un espacio pase a tener "activos reales" (ver hasRealAssets en
 * getAccountBalances): sin esto, "Patrimonio Neto" nunca tendria sentido, ya
 * que toda cuenta nace en $0 y el primer gasto la volveria negativa.
 */
export async function updateOpeningBalance(
  accountId: string,
  spaceId: string,
  openingBalance: number,
): Promise<{ success: true } | { success: false; error: string }> {
  const supabase = await getSupabaseServerClient();

  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();
  if (authError || !user) {
    return { success: false, error: 'No autorizado' };
  }

  if (!Number.isFinite(openingBalance) || openingBalance < 0) {
    return { success: false, error: 'El saldo debe ser un numero valido, cero o mayor.' };
  }

  const { error, count } = await supabase
    .from('accounts')
    .update({ opening_balance: openingBalance }, { count: 'exact' })
    .eq('id', accountId)
    .eq('space_id', spaceId);

  if (error) {
    console.error('Error al actualizar el saldo inicial:', error);
    return { success: false, error: 'No se pudo actualizar el saldo inicial.' };
  }
  if (!count) {
    return { success: false, error: 'No tienes permiso para editar esta cuenta.' };
  }

  return { success: true };
}
