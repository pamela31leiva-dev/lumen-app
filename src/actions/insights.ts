'use server';

import { getSupabaseServerClient } from '@/infrastructure/supabase/server';
import type { TransactionType } from '@/domain/types/capture';

export interface ConfirmationInsightInput {
  spaceId: string;
  type: TransactionType;
  categoryId: string | null;
  transactionDate: string; // ISO 8601
}

const GENERIC_MESSAGE = 'Listo. Un pendiente menos en tu espacio.';

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
 * igual que el resto de metricas deterministicas de Lumen. El objetivo es
 * dar valor inmediato sin alucinar ni sonar a regaño -- solo un hecho neutral.
 */
export async function getConfirmationInsight(input: ConfirmationInsightInput): Promise<string> {
  const supabase = await getSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return GENERIC_MESSAGE;

  if (input.type === 'income') {
    return 'Ingreso registrado. Tu liquidez de este mes ya lo refleja.';
  }
  if (input.type === 'transfer') {
    return 'Transferencia registrada entre tus cuentas.';
  }
  if (!input.categoryId) return GENERIC_MESSAGE;

  const weekStartDate = startOfWeek(new Date());
  // Si el movimiento confirmado no cae en la semana actual (ej. se estaba
  // poniendo al dia con algo de hace tiempo), comparar contra "esta semana"
  // no tendria sentido -- mejor el mensaje generico que una cifra confusa.
  if (new Date(input.transactionDate) < weekStartDate) return GENERIC_MESSAGE;
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
  if (weekTotal <= 0) return GENERIC_MESSAGE;

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
