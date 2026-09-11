'use server';

import { cookies } from 'next/headers';
import { getSupabaseServerClient } from '@/infrastructure/supabase/server';
import { ACTIVE_SPACE_COOKIE } from '@/lib/constants';
import type {
  AccountBalancesData,
  CategoryOption,
  IdentitySnapshot,
  ImpactSummary,
  ImpactTopCategory,
  MemberRole,
  PendingTransactionSummary,
  SpaceSummary,
  SpaceType,
  SubscriptionSummary,
  TransactionHistoryItem,
} from '@/domain/types/dashboard';

interface SpaceMembershipRow {
  role: MemberRole;
  space: {
    id: string;
    name: string;
    type: SpaceType;
    base_currency: string;
    is_pro: boolean;
  } | null;
}

/** Espacios donde el usuario autenticado es miembro (is_space_member(space_id) = true via RLS). */
export async function getUserSpaces(): Promise<SpaceSummary[]> {
  const supabase = await getSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return [];

  const { data, error } = await supabase
    .from('space_members')
    .select('role, space:spaces(id, name, type, base_currency, is_pro)')
    .eq('user_id', user.id)
    .returns<SpaceMembershipRow[]>();

  if (error || !data) {
    console.error('Error al listar los espacios del usuario:', error);
    return [];
  }

  return data
    .filter((row): row is SpaceMembershipRow & { space: NonNullable<SpaceMembershipRow['space']> } => row.space !== null)
    .map((row) => ({
      id: row.space.id,
      name: row.space.name,
      type: row.space.type,
      baseCurrency: row.space.base_currency,
      role: row.role,
      isPro: row.space.is_pro,
    }));
}

/** Crea un espacio nuevo. El trigger handle_new_space agrega al creador como owner automaticamente. */
export async function createSpace(name: string, type: SpaceType, baseCurrency = 'COP'): Promise<{ success: true; spaceId: string } | { success: false; error: string }> {
  const supabase = await getSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { success: false, error: 'No autorizado' };

  const trimmedName = name.trim();
  if (!trimmedName) return { success: false, error: 'El espacio necesita un nombre.' };

  const { data, error } = await supabase
    .from('spaces')
    .insert({ name: trimmedName, type, base_currency: baseCurrency, owner_id: user.id })
    .select('id')
    .single();

  if (error || !data) {
    console.error('Error al crear el espacio:', error);
    return { success: false, error: 'No se pudo crear el espacio.' };
  }

  const cookieStore = await cookies();
  cookieStore.set(ACTIVE_SPACE_COOKIE, data.id, { path: '/', maxAge: 60 * 60 * 24 * 365 });

  return { success: true, spaceId: data.id };
}

/** Marca el espacio activo para la sesion (cookie leida por src/app/executive-board/page.tsx). */
export async function setActiveSpace(spaceId: string): Promise<{ success: boolean }> {
  const supabase = await getSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { success: false };

  const { data: membership } = await supabase
    .from('space_members')
    .select('space_id')
    .eq('space_id', spaceId)
    .eq('user_id', user.id)
    .maybeSingle();
  if (!membership) return { success: false };

  const cookieStore = await cookies();
  cookieStore.set(ACTIVE_SPACE_COOKIE, spaceId, { path: '/', maxAge: 60 * 60 * 24 * 365 });
  return { success: true };
}

/** Saldos deterministicos: lee directo de la vista account_balances (Postgres calcula, nadie mas). */
export async function getAccountBalances(spaceId: string): Promise<AccountBalancesData> {
  const supabase = await getSupabaseServerClient();

  const [{ data: space }, { data: balances, error }, { data: accountRows }] = await Promise.all([
    supabase.from('spaces').select('base_currency').eq('id', spaceId).single(),
    supabase
      .from('account_balances')
      .select('account_id, space_id, account_name, account_type, account_currency, is_active, current_balance, current_balance_original')
      .eq('space_id', spaceId)
      .order('account_name', { ascending: true }),
    // La vista account_balances no expone opening_balance; se consulta aparte
    // para mostrarlo/editarlo y para decidir si hay activos reales
    // declarados (ver hasRealAssets).
    supabase.from('accounts').select('id, opening_balance').eq('space_id', spaceId),
  ]);

  if (error) {
    console.error('Error al leer account_balances:', error);
  }

  const openingBalanceById = new Map((accountRows ?? []).map((a) => [a.id, Number(a.opening_balance)]));

  return {
    baseCurrency: space?.base_currency ?? 'COP',
    accounts: (balances ?? []).map((row) => ({
      accountId: row.account_id,
      spaceId: row.space_id,
      name: row.account_name,
      type: row.account_type,
      currency: row.account_currency,
      isActive: row.is_active,
      currentBalance: Number(row.current_balance),
      currentBalanceOriginal: Number(row.current_balance_original),
      openingBalance: openingBalanceById.get(row.account_id) ?? 0,
    })),
    hasRealAssets: [...openingBalanceById.values()].some((v) => v > 0),
  };
}

/**
 * Flujo neto de dinero CONFIRMADO en el mes calendario en curso (ingresos -
 * gastos; un transfer es neutro para el espacio como un todo, no cuenta).
 * Se usa como reemplazo de "Patrimonio Neto" cuando el espacio no tiene
 * activos reales declarados (ver hasRealAssets en getAccountBalances):
 * mostrar de entrada un "patrimonio" negativo por el primer gasto suelto es
 * enganoso -- esto en cambio se lee como "lo que ha entrado y salido este
 * mes", que se resetea cada mes en vez de arrastrar una cifra alarmante.
 */
export async function getMonthlyNetFlow(spaceId: string): Promise<number> {
  const supabase = await getSupabaseServerClient();
  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();

  const { data, error } = await supabase
    .from('transactions')
    .select('type, amount_base')
    .eq('space_id', spaceId)
    .eq('status', 'confirmed')
    .gte('transaction_date', monthStart);

  if (error || !data) {
    console.error('Error al calcular el flujo del mes:', error);
    return 0;
  }

  return data.reduce((sum, row) => {
    const amount = Number(row.amount_base);
    if (row.type === 'income') return sum + amount;
    if (row.type === 'expense') return sum - amount;
    return sum;
  }, 0);
}

/** Transacciones en pending_confirmation: la bandeja de revision humana. */
export async function getPendingTransactions(spaceId: string): Promise<PendingTransactionSummary[]> {
  const supabase = await getSupabaseServerClient();

  const { data, error } = await supabase
    .from('transactions')
    .select(
      'id, type, status, source, description, amount_original, currency_original, confidence_score, ai_raw_interpretation, account_id, category_id, transaction_date, receipt_id, created_at, tags, is_business',
    )
    .eq('space_id', spaceId)
    .eq('status', 'pending_confirmation')
    .order('created_at', { ascending: false });

  if (error || !data) {
    console.error('Error al leer transacciones pendientes:', error);
    return [];
  }

  return data.map((row) => ({
    id: row.id,
    type: row.type,
    status: row.status,
    source: row.source,
    description: row.description,
    amountOriginal: Number(row.amount_original),
    currencyOriginal: row.currency_original,
    confidenceScore: row.confidence_score !== null ? Number(row.confidence_score) : null,
    uncertainties: Array.isArray((row.ai_raw_interpretation as { uncertainties?: string[] } | null)?.uncertainties)
      ? ((row.ai_raw_interpretation as { uncertainties: string[] }).uncertainties)
      : [],
    accountId: row.account_id,
    categoryId: row.category_id,
    transactionDate: row.transaction_date,
    receiptId: row.receipt_id,
    createdAt: row.created_at,
    tags: Array.isArray(row.tags) ? row.tags : [],
    clarificationQuestion:
      (row.ai_raw_interpretation as { clarification_question?: string | null } | null)?.clarification_question ?? null,
    clarificationOptions:
      (row.ai_raw_interpretation as { clarification_options?: string[] } | null)?.clarification_options ?? [],
    suggestedSpaceId:
      (row.ai_raw_interpretation as { resolved_suggested_space_id?: string | null } | null)?.resolved_suggested_space_id ??
      null,
    suggestedSpaceName:
      (row.ai_raw_interpretation as { suggested_space_name?: string | null } | null)?.suggested_space_name ?? null,
    isBusiness: Boolean(row.is_business),
  }));
}

/**
 * Historial de movimientos CONFIRMADOS (pantalla de consulta en /settings,
 * no el tablero principal — Cero Ruido). Limitado a los ultimos 50: es una
 * bandeja de revision/borrado puntual, no un libro contable completo.
 */
export async function getTransactionHistory(spaceId: string, limit = 50): Promise<TransactionHistoryItem[]> {
  const supabase = await getSupabaseServerClient();

  const { data, error } = await supabase
    .from('transactions')
    .select(
      'id, type, description, amount_original, currency_original, transaction_date, tags, category_id, category:categories(name)',
    )
    .eq('space_id', spaceId)
    .eq('status', 'confirmed')
    .order('transaction_date', { ascending: false })
    .limit(limit)
    .returns<
      {
        id: string;
        type: TransactionHistoryItem['type'];
        description: string | null;
        amount_original: number;
        currency_original: string;
        transaction_date: string;
        tags: string[] | null;
        category_id: string | null;
        category: { name: string } | null;
      }[]
    >();

  if (error || !data) {
    console.error('Error al leer el historial de movimientos:', error);
    return [];
  }

  return data.map((row) => ({
    id: row.id,
    type: row.type,
    description: row.description,
    amountOriginal: Number(row.amount_original),
    currencyOriginal: row.currency_original,
    categoryId: row.category_id,
    categoryName: row.category?.name ?? null,
    transactionDate: row.transaction_date,
    tags: Array.isArray(row.tags) ? row.tags : [],
  }));
}

/**
 * "Tu año en numeros" — estructura base del Resumen de Impacto (retencion +
 * marketing organico estilo Spotify Wrapped). Calcula sobre transacciones
 * CONFIRMADAS de los ultimos `months` meses; nunca pendientes, y nunca hace
 * el LLM estos calculos (son deterministicos, igual que account_balances).
 */
export async function getImpactSummary(spaceId: string, months = 12): Promise<ImpactSummary | null> {
  const supabase = await getSupabaseServerClient();

  const { data: space } = await supabase.from('spaces').select('name, base_currency').eq('id', spaceId).single();
  if (!space) return null;

  const periodEnd = new Date();
  const periodStart = new Date(periodEnd);
  periodStart.setMonth(periodStart.getMonth() - months);

  const { data, error } = await supabase
    .from('transactions')
    .select('type, description, amount_original, transaction_date, category:categories(name)')
    .eq('space_id', spaceId)
    .eq('status', 'confirmed')
    .gte('transaction_date', periodStart.toISOString())
    .lte('transaction_date', periodEnd.toISOString())
    .returns<
      {
        type: 'income' | 'expense' | 'transfer';
        description: string | null;
        amount_original: number;
        transaction_date: string;
        category: { name: string } | null;
      }[]
    >();

  if (error || !data) {
    console.error('Error al calcular el resumen de impacto:', error);
    return null;
  }

  let totalIncome = 0;
  let totalExpense = 0;
  const categoryTotals = new Map<string, { total: number; count: number }>();
  const monthCounts = new Map<string, number>();
  const activeDays = new Set<string>();
  let biggestExpense: ImpactSummary['biggestExpense'] = null;

  for (const row of data) {
    const amount = Number(row.amount_original);
    const day = row.transaction_date.slice(0, 10);
    activeDays.add(day);

    const monthLabel = new Date(row.transaction_date).toLocaleDateString('es-CO', { month: 'long', year: 'numeric' });
    monthCounts.set(monthLabel, (monthCounts.get(monthLabel) ?? 0) + 1);

    if (row.type === 'income') {
      totalIncome += amount;
    } else if (row.type === 'expense') {
      totalExpense += amount;
      const categoryName = row.category?.name ?? 'Sin categoria';
      const current = categoryTotals.get(categoryName) ?? { total: 0, count: 0 };
      categoryTotals.set(categoryName, { total: current.total + amount, count: current.count + 1 });

      if (!biggestExpense || amount > biggestExpense.amount) {
        biggestExpense = { description: row.description, amount, date: row.transaction_date };
      }
    }
  }

  const topExpenseCategories: ImpactTopCategory[] = [...categoryTotals.entries()]
    .map(([name, v]) => ({ name, totalAmount: v.total, transactionCount: v.count }))
    .sort((a, b) => b.totalAmount - a.totalAmount)
    .slice(0, 3);

  let busiestMonth: ImpactSummary['busiestMonth'] = null;
  for (const [label, count] of monthCounts.entries()) {
    if (!busiestMonth || count > busiestMonth.transactionCount) {
      busiestMonth = { label, transactionCount: count };
    }
  }

  return {
    spaceName: space.name,
    baseCurrency: space.base_currency,
    periodLabel: months >= 12 ? 'Ultimos 12 meses' : `Ultimos ${months} meses`,
    periodStart: periodStart.toISOString(),
    periodEnd: periodEnd.toISOString(),
    totalIncome,
    totalExpense,
    transactionCount: data.length,
    topExpenseCategories,
    biggestExpense,
    busiestMonth,
    activeDayCount: activeDays.size,
  };
}

/**
 * "Asi te conozco" -- refuerzo del Clarity Loop mostrando lo que Lumen ya
 * aprendio de este espacio: las clarificaciones que el usuario mismo
 * respondio (classification_hints, ya usadas para no repreguntar) y su
 * categoria de gasto mas frecuente entre lo ya CONFIRMADO. Nada inventado:
 * si no hay suficiente historial, los campos simplemente quedan vacios/null.
 */
export async function getIdentitySnapshot(spaceId: string): Promise<IdentitySnapshot> {
  const supabase = await getSupabaseServerClient();

  const [{ data: hintRows }, { data: txRows }] = await Promise.all([
    supabase
      .from('classification_hints')
      .select('question, answer')
      .eq('space_id', spaceId)
      .order('created_at', { ascending: false })
      .limit(6),
    supabase
      .from('transactions')
      .select('amount_base, category:categories(name)')
      .eq('space_id', spaceId)
      .eq('status', 'confirmed')
      .eq('type', 'expense')
      .returns<{ amount_base: number; category: { name: string } | null }[]>(),
  ]);

  const learnedHints = (hintRows ?? []).map((h) => ({ question: h.question, answer: h.answer }));

  const totalsByCategory = new Map<string, number>();
  let totalExpense = 0;
  for (const row of txRows ?? []) {
    const amount = Number(row.amount_base);
    totalExpense += amount;
    const name = row.category?.name;
    if (!name) continue;
    totalsByCategory.set(name, (totalsByCategory.get(name) ?? 0) + amount);
  }

  let topCategoryName: string | null = null;
  let topCategoryShare: number | null = null;
  if (totalsByCategory.size > 0 && totalExpense > 0) {
    const [name, total] = Array.from(totalsByCategory.entries()).sort((a, b) => b[1] - a[1])[0];
    topCategoryName = name;
    topCategoryShare = Math.round((total / totalExpense) * 100);
  }

  return { learnedHints, topCategoryName, topCategoryShare };
}

/** Plan del usuario autenticado. Sin fila (usuarios previos al 0008 no respaldados) = Gratis/activo por default. */
export async function getMySubscription(): Promise<SubscriptionSummary> {
  const supabase = await getSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const fallback: SubscriptionSummary = { plan: 'free', status: 'active', maxSpaces: null, maxMonthlyRecords: null, maxStorageMb: null };
  if (!user) return fallback;

  const { data } = await supabase
    .from('subscriptions')
    .select('plan, status, max_spaces, max_monthly_records, max_storage_mb')
    .eq('user_id', user.id)
    .maybeSingle();

  if (!data) return fallback;

  return {
    plan: data.plan,
    status: data.status,
    maxSpaces: data.max_spaces,
    maxMonthlyRecords: data.max_monthly_records,
    maxStorageMb: data.max_storage_mb,
  };
}

/** Categorias visibles para el espacio: globales del sistema (space_id null) + propias. */
export async function getCategories(spaceId: string): Promise<CategoryOption[]> {
  const supabase = await getSupabaseServerClient();

  const { data, error } = await supabase
    .from('categories')
    .select('id, name, kind, is_system, space_id')
    .or(`space_id.eq.${spaceId},space_id.is.null`)
    .order('kind', { ascending: true })
    .order('name', { ascending: true });

  if (error || !data) {
    console.error('Error al leer categorias:', error);
    return [];
  }

  return data.map((row) => ({ id: row.id, name: row.name, kind: row.kind, isSystem: row.is_system }));
}

/** URL firmada de corta duracion para ver un documento fuente sin exponer el bucket publicamente. */
export async function getReceiptSignedUrl(receiptId: string, spaceId: string): Promise<{ url: string } | { error: string }> {
  const supabase = await getSupabaseServerClient();

  const { data: receipt, error } = await supabase
    .from('receipts')
    .select('storage_path')
    .eq('id', receiptId)
    .eq('space_id', spaceId)
    .single();

  if (error || !receipt?.storage_path) {
    return { error: 'Este movimiento no tiene un documento adjunto.' };
  }

  const { data, error: signError } = await supabase.storage.from('receipts').createSignedUrl(receipt.storage_path, 60);
  if (signError || !data) {
    console.error('Error al firmar la URL del documento:', signError);
    return { error: 'No se pudo generar el enlace al documento.' };
  }

  return { url: data.signedUrl };
}
