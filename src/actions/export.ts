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
  /** Clasificacion fiscal de la categoria en ESTE espacio (Bloque P5) -- null si no se ha clasificado. */
  taxTreatment: string | null;
  /** Retencion en la fuente declarada sobre este movimiento (Bloque P5) -- null si no aplica o no se declaro. */
  withholdingTaxAmount: number | null;
  /** CUFE de la factura XML que origino este movimiento, si la tiene (0026) -- trazabilidad para el contador. */
  cufe: string | null;
}

export interface ExportAccountRow {
  name: string;
  type: string;
  currency: string;
  isActive: boolean;
  openingBalance: number;
  currentBalance: number;
}

export interface ExportBillRow {
  description: string;
  amount: number;
  currency: string;
  dueDate: string;
  status: 'pending' | 'paid';
}

export interface ExportDataset {
  spaceName: string;
  baseCurrency: string;
  periodStart: string;
  periodEnd: string;
  transactions: ExportTransactionRow[];
  /** Snapshot actual de cuentas -- no se filtra por periodo, un saldo es del presente, no de un rango. */
  accounts: ExportAccountRow[];
  /** Historico completo de facturas (pendientes y pagadas) -- Portabilidad de Datos no deberia ocultar lo ya resuelto. */
  bills: ExportBillRow[];
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

  // Las 6 consultas son independientes entre si -- un solo round-trip
  // paralelo en vez de "espacio" primero, luego 3 mas, luego el saldo
  // inicial al final (asi estaba antes: 3 vueltas secuenciales).
  const [
    { data: space, error: spaceError },
    { data, error },
    { data: accountRows, error: accountsError },
    { data: billRows, error: billsError },
    { data: openingBalances },
  ] = await Promise.all([
    supabase.from('spaces').select('name, base_currency').eq('id', spaceId).single(),
    supabase
      .from('transactions')
      .select(
        'type, description, transaction_date, amount_base, withholding_tax_amount, tax_treatment, category:categories(name, kind), account:accounts!transactions_account_id_fkey(name), receipt:receipts(cufe)',
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
          withholding_tax_amount: number | null;
          tax_treatment: string | null;
          category: { name: string; kind: 'income' | 'expense' } | null;
          account: { name: string } | null;
          receipt: { cufe: string | null } | null;
        }[]
      >(),
    supabase
      .from('account_balances')
      .select('account_name, account_type, account_currency, is_active, current_balance')
      .eq('space_id', spaceId)
      .order('account_name', { ascending: true }),
    supabase
      .from('bills')
      .select('description, amount, currency, due_date, status')
      .eq('space_id', spaceId)
      .order('due_date', { ascending: true }),
    supabase.from('accounts').select('name, opening_balance').eq('space_id', spaceId),
  ]);

  if (spaceError || !space) {
    return { error: 'No tienes acceso a este espacio' };
  }
  if (error) {
    console.error('Error al leer datos para exportacion:', error);
    return { error: 'No se pudo generar el reporte.' };
  }
  if (accountsError) console.error('Error al leer cuentas para exportacion:', accountsError);
  if (billsError) console.error('Error al leer facturas para exportacion:', billsError);

  const openingByName = new Map((openingBalances ?? []).map((a) => [a.name, Number(a.opening_balance)]));

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
      // Bloque P8: el tratamiento fiscal vive en la propia transaccion
      // (heredado al confirmar, ajustable por movimiento) -- ya no se
      // resuelve via un JOIN en vivo a category_fiscal_tags, que hubiera
      // reclasificado silenciosamente movimientos viejos si la categoria
      // cambiaba de etiqueta despues.
      taxTreatment: row.tax_treatment,
      withholdingTaxAmount: row.withholding_tax_amount !== null ? Number(row.withholding_tax_amount) : null,
      cufe: row.receipt?.cufe ?? null,
    })),
    accounts: (accountRows ?? []).map((row) => ({
      name: row.account_name,
      type: row.account_type,
      currency: row.account_currency,
      isActive: row.is_active,
      openingBalance: openingByName.get(row.account_name) ?? 0,
      currentBalance: Number(row.current_balance),
    })),
    bills: (billRows ?? []).map((row) => ({
      description: row.description,
      amount: Number(row.amount),
      currency: row.currency,
      dueDate: row.due_date,
      status: row.status,
    })),
  };
}
