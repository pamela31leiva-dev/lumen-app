'use server';

import { getSupabaseServerClient } from '@/infrastructure/supabase/server';
import { getExchangeRate } from '@/actions/currency';
import type { AccountType } from '@/domain/types/dashboard';

/**
 * Crea una cuenta nueva en el espacio -- hasta el Bloque P7 la unica forma de
 * tener una cuenta era la "Efectivo" que get_or_create_default_account arma
 * sola (0018). Es la pieza que faltaba para "registrar cuentas en diferentes
 * monedas": currency queda fija para siempre (cambiarla despues volveria
 * ambiguo cada movimiento historico ya sumado en account_balances).
 */
export async function createAccount(
  spaceId: string,
  name: string,
  type: AccountType,
  currency: string,
): Promise<{ success: true; accountId: string } | { success: false; error: string }> {
  const supabase = await getSupabaseServerClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();
  if (authError || !user) {
    return { success: false, error: 'No autorizado' };
  }

  const trimmedName = name.trim();
  if (!trimmedName) {
    return { success: false, error: 'Escribe un nombre para la cuenta.' };
  }
  const normalizedCurrency = currency.trim().toUpperCase();
  if (normalizedCurrency.length !== 3) {
    return { success: false, error: 'La moneda debe ser un codigo de 3 letras (ej. USD).' };
  }

  const { data, error } = await supabase
    .from('accounts')
    .insert({ space_id: spaceId, name: trimmedName, type, currency: normalizedCurrency, created_by: user.id })
    .select('id')
    .single();

  if (error) {
    console.error('Error al crear la cuenta:', error);
    return { success: false, error: 'No se pudo crear la cuenta. Intenta de nuevo.' };
  }

  return { success: true, accountId: data.id };
}

/**
 * Declara el saldo inicial "real" de una cuenta -- el dinero que ya existia
 * antes de que Lumen empezara a llevar el registro. Es la unica forma de
 * que un espacio pase a tener "activos reales" (ver hasRealAssets en
 * getAccountBalances): sin esto, "Patrimonio Neto" nunca tendria sentido, ya
 * que toda cuenta nace en $0 y el primer gasto la volveria negativa.
 *
 * opening_balance_fx_rate (0033): si la cuenta esta en una moneda distinta a
 * la del espacio, se fija la tasa del dia AHORA -- igual que exchange_rate en
 * una transaccion, no se recalcula sola despues. account_balances.current_balance
 * es lo que multiplica opening_balance por esta tasa para consolidar en
 * moneda base (antes de 0032 toda cuenta nacia ya en la moneda base, por eso
 * este paso no existia).
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

  const [{ data: account }, { data: space }] = await Promise.all([
    supabase.from('accounts').select('currency').eq('id', accountId).eq('space_id', spaceId).single(),
    supabase.from('spaces').select('base_currency').eq('id', spaceId).single(),
  ]);
  if (!account || !space) {
    return { success: false, error: 'No se encontro la cuenta.' };
  }

  let fxRate = 1;
  if (account.currency !== space.base_currency) {
    const lookup = await getExchangeRate(account.currency, space.base_currency);
    if (!lookup.success) return { success: false, error: lookup.error };
    fxRate = lookup.data.rate;
  }

  const { error, count } = await supabase
    .from('accounts')
    .update({ opening_balance: openingBalance, opening_balance_fx_rate: fxRate }, { count: 'exact' })
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
