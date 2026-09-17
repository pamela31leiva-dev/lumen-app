'use server';

import { getSupabaseServerClient } from '@/infrastructure/supabase/server';
import { getExchangeRate } from '@/actions/currency';
import { roundMoney } from '@/domain/currency';
import type { AlternativeAssetSummary, AlternativeAssetType } from '@/domain/types/dashboard';

interface AlternativeAssetRow {
  id: string;
  name: string;
  asset_type: AlternativeAssetType;
  currency: string;
  quantity: number;
  unit_value: number;
  current_value: number;
  valuation_date: string;
  notes: string | null;
}

/**
 * Lista los activos alternativos del espacio con su valor ya convertido a la
 * moneda base cuando hay una tasa disponible (ver getExchangeRate -- nunca
 * bloquea: si una moneda no tiene ninguna tasa cacheada todavia,
 * currentValueBase queda en null y la interfaz lo muestra sin convertir en
 * vez de fallar toda la lista).
 */
export async function getAlternativeAssets(
  spaceId: string,
  baseCurrency: string,
): Promise<{ assets: AlternativeAssetSummary[]; totalBase: number }> {
  const supabase = await getSupabaseServerClient();

  const { data, error } = await supabase
    .from('alternative_assets')
    .select('id, name, asset_type, currency, quantity, unit_value, current_value, valuation_date, notes')
    .eq('space_id', spaceId)
    .eq('is_active', true)
    .order('created_at', { ascending: false })
    .returns<AlternativeAssetRow[]>();

  if (error) {
    console.error('Error al leer activos alternativos:', error);
    return { assets: [], totalBase: 0 };
  }

  const rows = data ?? [];
  const distinctCurrencies = [...new Set(rows.map((r) => r.currency))].filter((c) => c !== baseCurrency);

  // Una sola tasa por moneda distinta (no por activo) -- evita N consultas de
  // FX cuando hay varios activos en la misma moneda extranjera.
  const rateByCurrency = new Map<string, number>();
  await Promise.all(
    distinctCurrencies.map(async (currency) => {
      const lookup = await getExchangeRate(currency, baseCurrency);
      if (lookup.success) rateByCurrency.set(currency, lookup.data.rate);
    }),
  );

  let totalBase = 0;
  const assets: AlternativeAssetSummary[] = rows.map((row) => {
    const currentValue = Number(row.current_value);
    const rate = row.currency === baseCurrency ? 1 : rateByCurrency.get(row.currency);
    const currentValueBase = rate !== undefined ? roundMoney(currentValue * rate) : null;
    if (currentValueBase !== null) totalBase += currentValueBase;

    return {
      id: row.id,
      name: row.name,
      assetType: row.asset_type,
      currency: row.currency,
      quantity: Number(row.quantity),
      unitValue: Number(row.unit_value),
      currentValue,
      currentValueBase,
      valuationDate: row.valuation_date,
      notes: row.notes,
    };
  });

  return { assets, totalBase: roundMoney(totalBase) };
}

interface AlternativeAssetInput {
  name: string;
  assetType: AlternativeAssetType;
  currency: string;
  quantity: number;
  unitValue: number;
  notes?: string | null;
}

function validateAssetInput(input: AlternativeAssetInput): string | null {
  if (!input.name.trim()) return 'Escribe un nombre para el activo.';
  if (input.currency.trim().length !== 3) return 'La moneda debe ser un codigo de 3 letras (ej. USD).';
  if (!Number.isFinite(input.quantity) || input.quantity <= 0) return 'La cantidad debe ser mayor que cero.';
  if (!Number.isFinite(input.unitValue) || input.unitValue < 0) return 'El valor unitario debe ser cero o mayor.';
  return null;
}

export async function createAlternativeAsset(
  spaceId: string,
  input: AlternativeAssetInput,
): Promise<{ success: true } | { success: false; error: string }> {
  const supabase = await getSupabaseServerClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();
  if (authError || !user) return { success: false, error: 'No autorizado' };

  const validationError = validateAssetInput(input);
  if (validationError) return { success: false, error: validationError };

  const { error } = await supabase.from('alternative_assets').insert({
    space_id: spaceId,
    name: input.name.trim(),
    asset_type: input.assetType,
    currency: input.currency.trim().toUpperCase(),
    quantity: input.quantity,
    unit_value: input.unitValue,
    notes: input.notes?.trim() || null,
    created_by: user.id,
  });

  if (error) {
    console.error('Error al crear el activo alternativo:', error);
    return { success: false, error: 'No se pudo guardar el activo. Intenta de nuevo.' };
  }

  return { success: true };
}

/** Actualiza cantidad/valor unitario de un activo -- "actualizar valuacion" al dia de hoy. */
export async function updateAlternativeAssetValue(
  assetId: string,
  spaceId: string,
  quantity: number,
  unitValue: number,
): Promise<{ success: true } | { success: false; error: string }> {
  const supabase = await getSupabaseServerClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();
  if (authError || !user) return { success: false, error: 'No autorizado' };

  if (!Number.isFinite(quantity) || quantity <= 0) return { success: false, error: 'La cantidad debe ser mayor que cero.' };
  if (!Number.isFinite(unitValue) || unitValue < 0) return { success: false, error: 'El valor unitario debe ser cero o mayor.' };

  const { error, count } = await supabase
    .from('alternative_assets')
    .update({ quantity, unit_value: unitValue, valuation_date: new Date().toISOString().slice(0, 10) }, { count: 'exact' })
    .eq('id', assetId)
    .eq('space_id', spaceId);

  if (error) {
    console.error('Error al actualizar el activo alternativo:', error);
    return { success: false, error: 'No se pudo actualizar el activo.' };
  }
  if (!count) return { success: false, error: 'No tienes permiso para editar este activo.' };

  return { success: true };
}

export async function deleteAlternativeAsset(assetId: string, spaceId: string): Promise<{ success: true } | { success: false; error: string }> {
  const supabase = await getSupabaseServerClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();
  if (authError || !user) return { success: false, error: 'No autorizado' };

  const { error, count } = await supabase.from('alternative_assets').delete({ count: 'exact' }).eq('id', assetId).eq('space_id', spaceId);

  if (error) {
    console.error('Error al eliminar el activo alternativo:', error);
    return { success: false, error: 'No se pudo eliminar el activo.' };
  }
  if (!count) return { success: false, error: 'No tienes permiso para eliminar este activo (requiere rol Owner o Admin).' };

  return { success: true };
}
