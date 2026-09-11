'use server';

import { getSupabaseServerClient } from '@/infrastructure/supabase/server';
import type { TransactionType } from '@/domain/types/capture';

export interface ConfirmationInsightInput {
  spaceId: string;
  type: TransactionType;
  categoryId: string | null;
  transactionDate: string; // ISO 8601
}

function startOfWeek(referenceDate: Date): Date {
  const start = new Date(referenceDate);
  start.setUTCHours(0, 0, 0, 0);
  start.setUTCDate(start.getUTCDate() - start.getUTCDay());
  return start;
}

/**
 * Micro-insight tras confirmar un movimiento -- deliberadamente NO es texto
 * generado por un LLM (agregaria latencia, costo y riesgo de inventar un
 * numero en una microinteraccion que se dispara en cada confirmacion): es
 * una proporcion real calculada sobre datos ya confirmados en Postgres,
 * igual que el resto de metricas deterministicas de Lumen. Devuelve null
 * cuando no hay nada mas informativo que decir -- en ese caso la tarjeta se
 * queda con la frase de refuerzo inicial (ver lib/clarity-loop.ts) en vez de
 * bajarle el tono a un mensaje generico.
 */
export async function getConfirmationInsight(input: ConfirmationInsightInput): Promise<string | null> {
  const supabase = await getSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  if (input.type === 'income') {
    return 'Ingreso registrado. Tu liquidez de este mes ya lo refleja.';
  }
  if (input.type === 'transfer') {
    return 'Transferencia registrada entre tus cuentas.';
  }
  if (!input.categoryId) return null;

  const weekStartDate = startOfWeek(new Date());
  // Si el movimiento confirmado no cae en la semana actual (ej. se estaba
  // poniendo al dia con algo de hace tiempo), comparar contra "esta semana"
  // no tendria sentido -- mejor dejar la frase de refuerzo que una cifra confusa.
  if (new Date(input.transactionDate) < weekStartDate) return null;
  const weekStart = weekStartDate.toISOString();

  // La transaccion que se acaba de confirmar ya esta en estado 'confirmed'
  // para cuando esto se ejecuta, asi que estas consultas ya la incluyen --
  // no hay que sumarla aparte.
  const { data: weekRows } = await supabase
    .from('transactions')
    .select('amount_base')
    .eq('space_id', input.spaceId)
    .eq('status', 'confirmed')
    .eq('type', 'expense')
    .gte('transaction_date', weekStart);

  const weekTotal = (weekRows ?? []).reduce((sum, row) => sum + Number(row.amount_base), 0);
  if (weekTotal <= 0) return null;

  const { data: categoryRows } = await supabase
    .from('transactions')
    .select('amount_base, category:categories(name)')
    .eq('space_id', input.spaceId)
    .eq('status', 'confirmed')
    .eq('type', 'expense')
    .eq('category_id', input.categoryId)
    .gte('transaction_date', weekStart)
    .returns<{ amount_base: number; category: { name: string } | null }[]>();

  const categoryTotal = (categoryRows ?? []).reduce((sum, row) => sum + Number(row.amount_base), 0);
  const categoryName = categoryRows?.[0]?.category?.name;
  const pct = Math.round((categoryTotal / weekTotal) * 100);

  return categoryName
    ? `Listo. ${categoryName} representa el ${pct}% de tu gasto de esta semana.`
    : `Listo. Esta categoria representa el ${pct}% de tu gasto de esta semana.`;
}
