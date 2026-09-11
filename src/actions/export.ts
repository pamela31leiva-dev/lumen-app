'use server';

import { getSupabaseServerClient } from '@/infrastructure/supabase/server';

export interface ExportTransactionRow {
  transactionDate: string; // ISO 8601
  type: 'income' | 'expense' | 'transfer';
  categoryName: string | null;
  categoryKind: 'income' | 'expense' | null;
  accountName: string | null;
  description: string | null;
  /** Monto en la moneda base del espacio (columna generada `amount_base`) -- nunca calculado por IA. */
  amountBase: number;
}

export interface ExportDataset {
  spaceName: string;
  baseCurrency: string;
  periodStart: string;
  periodEnd: string;
  transactions: ExportTransactionRow[];
}

/**
 * Dataset fuente para la exportacion a Excel (Flujo de Caja, Balance por
 * Categorias, Estado de Resultados). Deliberadamente NO es una consulta
 * abierta controlada por IA: los unicos parametros son un espacio (al que el
 * usuario ya pertenece, verificado por RLS) y un rango de fechas fijo, y todo
 * el calculo posterior (sumas, agrupaciones) ocurre en el cliente sobre estos
 * datos ya deterministicos -- igual que account_balances o getImpactSummary,
 * nunca algo que un LLM deba inventar o pueda romper con una consulta libre.
 * Solo incluye transacciones CONFIRMADAS: un reporte para un contador nunca
 * deberia incluir movimientos que el usuario aun no valido.
 */
export async function getExportDataset(
  spaceId: string,
  periodStart: string,
  periodEnd: string,
): Promise<ExportDataset | { error: string }> {
  const supabase = await getSupabaseServerClient();

  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();
  if (authError || !user) {
    return { error: 'No autorizado' };
  }

  const { data: space, error: spaceError } = await supabase
    .from('spaces')
    .select('name, base_currency')
    .eq('id', spaceId)
    .single();
  if (spaceError || !space) {
    return { error: 'No tienes acceso a este espacio' };
  }

  const { data, error } = await supabase
    .from('transactions')
    .select(
      'type, description, transaction_date, amount_base, category:categories(name, kind), account:accounts!transactions_account_id_fkey(name)',
    )
    .eq('space_id', spaceId)
    .eq('status', 'confirmed')
    .gte('transaction_date', periodStart)
    .lte('transaction_date', periodEnd)
    .order('transaction_date', { ascending: true })
    .returns<
      {
        type: ExportTransactionRow['type'];
        description: string | null;
        transaction_date: string;
        amount_base: number;
        category: { name: string; kind: 'income' | 'expense' } | null;
        account: { name: string } | null;
      }[]
    >();

  if (error) {
    console.error('Error al leer datos para exportacion:', error);
    return { error: 'No se pudo generar el reporte.' };
  }

  return {
    spaceName: space.name,
    baseCurrency: space.base_currency,
    periodStart,
    periodEnd,
    transactions: (data ?? []).map((row) => ({
      transactionDate: row.transaction_date,
      type: row.type,
      categoryName: row.category?.name ?? null,
      categoryKind: row.category?.kind ?? null,
      accountName: row.account?.name ?? null,
      description: row.description,
      amountBase: Number(row.amount_base),
    })),
  };
}
