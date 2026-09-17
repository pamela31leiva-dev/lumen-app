'use server';

import { getSupabaseServerClient } from '@/infrastructure/supabase/server';
import { getSupabaseServiceRoleClient } from '@/infrastructure/supabase/service-role-client';

export interface ExchangeRateResult {
  rate: number;
  /** Fecha real de la tasa devuelta -- puede diferir de la pedida si isApprox es true. */
  rateDate: string;
  /** true si no habia tasa exacta para la fecha pedida y se uso la mas cercana disponible. */
  isApprox: boolean;
  source: string;
}

export type ExchangeRateLookup = { success: true; data: ExchangeRateResult } | { success: false; error: string };

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

/**
 * open.er-api.com: gratis, sin API key, cubre ~160 monedas incluido COP --
 * pero solo expone la tasa MAS RECIENTE (no historial). Por eso el "historico"
 * de este modulo se construye hacia adelante: cada vez que se pide la tasa de
 * HOY, se guarda en exchange_rates con esa fecha, y desde entonces consultar
 * esa fecha ya devuelve la tasa real que Lumen vio ese dia (ver getExchangeRate).
 */
async function fetchLiveRate(from: string, to: string): Promise<number | null> {
  try {
    const response = await fetch(`https://open.er-api.com/v6/latest/${from}`, { cache: 'no-store' });
    if (!response.ok) return null;
    const json: { result?: string; rates?: Record<string, number> } = await response.json();
    if (json.result !== 'success' || !json.rates) return null;
    const rate = json.rates[to];
    return typeof rate === 'number' && rate > 0 ? rate : null;
  } catch (error) {
    console.error('Error al consultar la tasa de cambio en vivo:', error);
    return null;
  }
}

/**
 * Tasa de cambio determinista: nunca la inventa el LLM (ver comentario en
 * capture-core.ts). Orden de resolucion, sin fabricar nada:
 *   1. Tasa exacta cacheada para from/to/fecha.
 *   2. Si la fecha pedida es hoy: tasa en vivo (open.er-api.com), cacheada
 *      para futuras consultas del mismo dia.
 *   3. La tasa cacheada mas cercana ANTES de la fecha pedida (isApprox=true).
 *   4. La tasa cacheada mas cercana DESPUES (isApprox=true) -- cubre el caso
 *      de una fecha anterior a que este espacio empezara a usar multimoneda.
 *   5. El par inverso (to/from) invertido, si existe.
 * Si nada de esto encuentra un numero real, se devuelve error explicito para
 * que la persona lo escriba a mano -- jamas un 1 silencioso disfrazado de tasa real.
 */
export async function getExchangeRate(fromCurrency: string, toCurrency: string, date?: string): Promise<ExchangeRateLookup> {
  const supabase = await getSupabaseServerClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();
  if (authError || !user) return { success: false, error: 'No autorizado' };

  const from = fromCurrency.trim().toUpperCase();
  const to = toCurrency.trim().toUpperCase();
  const targetDate = date ?? todayIso();

  if (from === to) {
    return { success: true, data: { rate: 1, rateDate: targetDate, isApprox: false, source: 'identidad' } };
  }

  const { data: exact } = await supabase
    .from('exchange_rates')
    .select('rate, rate_date, source')
    .eq('from_currency', from)
    .eq('to_currency', to)
    .eq('rate_date', targetDate)
    .maybeSingle();
  if (exact) {
    return { success: true, data: { rate: Number(exact.rate), rateDate: exact.rate_date, isApprox: false, source: exact.source } };
  }

  if (targetDate === todayIso()) {
    const liveRate = await fetchLiveRate(from, to);
    if (liveRate !== null) {
      const serviceClient = getSupabaseServiceRoleClient();
      if (serviceClient) {
        const { error: upsertError } = await serviceClient
          .from('exchange_rates')
          .upsert(
            { from_currency: from, to_currency: to, rate_date: targetDate, rate: liveRate, source: 'open.er-api.com' },
            { onConflict: 'from_currency,to_currency,rate_date' },
          );
        if (upsertError) console.error('Error al cachear la tasa de cambio:', upsertError);
      }
      return { success: true, data: { rate: liveRate, rateDate: targetDate, isApprox: false, source: 'open.er-api.com' } };
    }
  }

  const { data: earlier } = await supabase
    .from('exchange_rates')
    .select('rate, rate_date, source')
    .eq('from_currency', from)
    .eq('to_currency', to)
    .lte('rate_date', targetDate)
    .order('rate_date', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (earlier) {
    return {
      success: true,
      data: { rate: Number(earlier.rate), rateDate: earlier.rate_date, isApprox: earlier.rate_date !== targetDate, source: earlier.source },
    };
  }

  const { data: later } = await supabase
    .from('exchange_rates')
    .select('rate, rate_date, source')
    .eq('from_currency', from)
    .eq('to_currency', to)
    .gt('rate_date', targetDate)
    .order('rate_date', { ascending: true })
    .limit(1)
    .maybeSingle();
  if (later) {
    return { success: true, data: { rate: Number(later.rate), rateDate: later.rate_date, isApprox: true, source: later.source } };
  }

  const { data: inverse } = await supabase
    .from('exchange_rates')
    .select('rate, rate_date, source')
    .eq('from_currency', to)
    .eq('to_currency', from)
    .order('rate_date', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (inverse && Number(inverse.rate) > 0) {
    return { success: true, data: { rate: 1 / Number(inverse.rate), rateDate: inverse.rate_date, isApprox: true, source: inverse.source } };
  }

  return { success: false, error: `No se encontro una tasa ${from} -> ${to}. Escribela manualmente.` };
}
