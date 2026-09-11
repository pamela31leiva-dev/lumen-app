'use server';

import { getSupabaseServerClient } from '@/infrastructure/supabase/server';
import {
  computeActivityStreak,
  computeBusinessCashInsight,
  computeCashFlowProjection,
  detectRecurringCashEvents,
  detectRecurringObligations,
  hasTransactionOnDate,
} from '@/domain/analytics/patterns';
import type {
  AccountBalance,
  AccountBalancesData,
  AccountType,
  CategoryOption,
  PendingTransactionSummary,
  SpaceMemberSummary,
  TransactionHistoryItem,
} from '@/domain/types/dashboard';
import type { BusinessCashInsight, CashFlowProjection, ProactiveInsights } from '@/domain/types/analytics';
import type { TransactionType } from '@/domain/types/capture';
import type { YearlySummary } from '@/actions/history';
import type { BillSummary } from '@/actions/bills';

interface SnapshotAccountRow {
  account_id: string;
  space_id: string;
  name: string;
  type: AccountType;
  currency: string;
  is_active: boolean;
  current_balance: number;
  current_balance_original: number;
  opening_balance: number;
}

interface SnapshotPendingRow {
  id: string;
  type: PendingTransactionSummary['type'];
  status: PendingTransactionSummary['status'];
  source: PendingTransactionSummary['source'];
  description: string | null;
  amount_original: number;
  currency_original: string;
  confidence_score: number | null;
  ai_raw_interpretation: {
    uncertainties?: string[];
    clarification_question?: string | null;
    clarification_options?: string[];
    resolved_suggested_space_id?: string | null;
    suggested_space_name?: string | null;
  } | null;
  account_id: string | null;
  category_id: string | null;
  transaction_date: string;
  receipt_id: string | null;
  created_at: string;
  tags: string[] | null;
  is_business: boolean;
  life_domain: 'personal' | 'familiar' | 'salud' | null;
}

interface SnapshotCategoryRow {
  id: string;
  name: string;
  kind: 'income' | 'expense';
  is_system: boolean;
}

interface SnapshotMemberRow {
  user_id: string;
  role: SpaceMemberSummary['role'];
  joined_at: string;
  email: string | null;
  full_name: string | null;
}

interface SnapshotRecentActivityRow {
  id: string;
  type: TransactionHistoryItem['type'];
  description: string | null;
  amount_original: number;
  currency_original: string;
  transaction_date: string;
  tags: string[] | null;
  category_id: string | null;
  category_name: string | null;
}

interface SnapshotBillRow {
  id: string;
  description: string;
  amount: number;
  currency: string;
  due_date: string;
}

interface SnapshotYearlyRow {
  year: number;
  total_income: number;
  total_expense: number;
  net_flow: number;
}

interface SnapshotPatternRow {
  description: string | null;
  amount_original: number;
  type: TransactionType;
  transaction_date: string;
}

interface SnapshotBusinessRow {
  type: TransactionType;
  amount_base: number;
  transaction_date: string;
}

interface ExecutiveBoardSnapshotJson {
  space: { base_currency: string } | null;
  accounts: SnapshotAccountRow[];
  pending_transactions: SnapshotPendingRow[];
  categories: SnapshotCategoryRow[];
  members: SnapshotMemberRow[];
  recent_activity: SnapshotRecentActivityRow[];
  bills: SnapshotBillRow[];
  monthly_net_flow: number;
  yearly_overview: SnapshotYearlyRow[];
  today_activity_dates: string[];
  pattern_rows: SnapshotPatternRow[];
  business_rows: SnapshotBusinessRow[];
}

export interface ExecutiveBoardSnapshot {
  baseCurrency: string;
  totalBalance: number;
  balances: AccountBalancesData;
  pendingTransactions: PendingTransactionSummary[];
  categories: CategoryOption[];
  spaceMembers: SpaceMemberSummary[];
  recentActivity: TransactionHistoryItem[];
  bills: BillSummary[];
  monthlyNetFlow: number;
  yearlyOverview: YearlySummary[];
  proactiveInsights: ProactiveInsights;
  businessCashInsight: BusinessCashInsight | null;
  cashFlowProjection: CashFlowProjection;
}

function billDaysUntilDue(dueDate: string): number {
  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);
  const DAY_MS = 86_400_000;
  return Math.round((new Date(dueDate).getTime() - todayStart.getTime()) / DAY_MS);
}

/**
 * Snapshot atomico del Executive Action Board: una unica llamada RPC
 * (get_executive_board_snapshot, ver 0018) reemplaza los 9+ round-trips
 * paralelos que antes hacia executive-board/page.tsx. La funcion en Postgres
 * ya agrega totales anuales y el flujo mensual con GROUP BY/SUM -- aqui solo
 * se traduce el JSON a los mismos tipos de dominio que ya consumian las
 * pantallas, sin cambiar ningun contrato hacia los componentes.
 *
 * businessAnalyticsLocked se aplica DESPUES de recibir el snapshot (los
 * agregados de negocio/proyeccion son baratos y siempre vienen calculados;
 * solo se evita correr el motor de patrones en JS sobre ellos cuando el
 * espacio de Negocio no tiene Pro).
 */
export async function getExecutiveBoardSnapshot(
  spaceId: string,
  businessAnalyticsLocked: boolean,
): Promise<ExecutiveBoardSnapshot> {
  const supabase = await getSupabaseServerClient();

  const { data: rawData, error } = await supabase.rpc('get_executive_board_snapshot', { p_space_id: spaceId });
  const data = rawData as ExecutiveBoardSnapshotJson | null;

  if (error || !data) {
    console.error('Error al leer el snapshot del tablero:', error);
    return {
      baseCurrency: 'COP',
      totalBalance: 0,
      balances: { baseCurrency: 'COP', accounts: [], hasRealAssets: false },
      pendingTransactions: [],
      categories: [],
      spaceMembers: [],
      recentActivity: [],
      bills: [],
      monthlyNetFlow: 0,
      yearlyOverview: [],
      proactiveInsights: { recurringObligations: [], hasActivityToday: false, activityStreakDays: 0 },
      businessCashInsight: null,
      cashFlowProjection: { currentBalance: 0, projectedBalance30d: 0, upcomingEvents: [], lowestPoint: null },
    };
  }

  const baseCurrency = data.space?.base_currency ?? 'COP';

  const accounts: AccountBalance[] = data.accounts.map((row) => ({
    accountId: row.account_id,
    spaceId: row.space_id,
    name: row.name,
    type: row.type,
    currency: row.currency,
    isActive: row.is_active,
    currentBalance: Number(row.current_balance),
    currentBalanceOriginal: Number(row.current_balance_original),
    openingBalance: Number(row.opening_balance),
  }));

  const balances: AccountBalancesData = {
    baseCurrency,
    accounts,
    hasRealAssets: accounts.some((a) => a.openingBalance > 0),
  };

  const totalBalance = accounts.reduce((sum, a) => sum + a.currentBalance, 0);

  const pendingTransactions: PendingTransactionSummary[] = data.pending_transactions.map((row) => ({
    id: row.id,
    type: row.type,
    status: row.status,
    source: row.source,
    description: row.description,
    amountOriginal: Number(row.amount_original),
    currencyOriginal: row.currency_original,
    confidenceScore: row.confidence_score !== null ? Number(row.confidence_score) : null,
    uncertainties: Array.isArray(row.ai_raw_interpretation?.uncertainties) ? row.ai_raw_interpretation.uncertainties : [],
    accountId: row.account_id,
    categoryId: row.category_id,
    transactionDate: row.transaction_date,
    receiptId: row.receipt_id,
    createdAt: row.created_at,
    tags: Array.isArray(row.tags) ? row.tags : [],
    clarificationQuestion: row.ai_raw_interpretation?.clarification_question ?? null,
    clarificationOptions: row.ai_raw_interpretation?.clarification_options ?? [],
    suggestedSpaceId: row.ai_raw_interpretation?.resolved_suggested_space_id ?? null,
    suggestedSpaceName: row.ai_raw_interpretation?.suggested_space_name ?? null,
    isBusiness: Boolean(row.is_business),
    lifeDomain: row.life_domain,
  }));

  const categories: CategoryOption[] = data.categories.map((row) => ({
    id: row.id,
    name: row.name,
    kind: row.kind,
    isSystem: row.is_system,
  }));

  const spaceMembers: SpaceMemberSummary[] = data.members.map((row) => ({
    userId: row.user_id,
    email: row.email ?? '(correo no disponible)',
    fullName: row.full_name,
    role: row.role,
    joinedAt: row.joined_at,
  }));

  const recentActivity: TransactionHistoryItem[] = data.recent_activity.map((row) => ({
    id: row.id,
    type: row.type,
    description: row.description,
    amountOriginal: Number(row.amount_original),
    currencyOriginal: row.currency_original,
    categoryId: row.category_id,
    categoryName: row.category_name,
    transactionDate: row.transaction_date,
    tags: Array.isArray(row.tags) ? row.tags : [],
  }));

  const bills: BillSummary[] = data.bills.map((row) => ({
    id: row.id,
    description: row.description,
    amount: Number(row.amount),
    currency: row.currency,
    dueDate: row.due_date,
    daysUntilDue: billDaysUntilDue(row.due_date),
  }));

  const yearlyOverview: YearlySummary[] = data.yearly_overview.map((row) => ({
    year: row.year,
    totalIncome: Number(row.total_income),
    totalExpense: Number(row.total_expense),
    netFlow: Number(row.net_flow),
  }));

  const patternRows = data.pattern_rows.map((row) => ({
    description: row.description,
    amountOriginal: Number(row.amount_original),
    type: row.type,
    transactionDate: row.transaction_date,
  }));

  const proactiveInsights: ProactiveInsights = {
    recurringObligations: detectRecurringObligations(patternRows),
    hasActivityToday: hasTransactionOnDate(data.today_activity_dates),
    activityStreakDays: computeActivityStreak(patternRows.map((row) => row.transactionDate)),
  };

  let businessCashInsight: BusinessCashInsight | null = null;
  let cashFlowProjection: CashFlowProjection = {
    currentBalance: totalBalance,
    projectedBalance30d: totalBalance,
    upcomingEvents: [],
    lowestPoint: null,
  };

  if (!businessAnalyticsLocked) {
    businessCashInsight = computeBusinessCashInsight(
      data.business_rows.map((row) => ({
        type: row.type,
        amountBase: Number(row.amount_base),
        transactionDate: row.transaction_date,
      })),
    );

    const recurringEvents = detectRecurringCashEvents(patternRows);
    cashFlowProjection = computeCashFlowProjection(totalBalance, recurringEvents);
  }

  return {
    baseCurrency,
    totalBalance,
    balances,
    pendingTransactions,
    categories,
    spaceMembers,
    recentActivity,
    bills,
    monthlyNetFlow: Number(data.monthly_net_flow),
    yearlyOverview,
    proactiveInsights,
    businessCashInsight,
    cashFlowProjection,
  };
}
