import type { CaptureSource, RecordStatus, TransactionType } from '@/domain/types/capture';

export type SpaceType = 'personal' | 'family' | 'business' | 'project';

export type MemberRole = 'owner' | 'admin' | 'editor' | 'viewer';

export type AccountType = 'cash' | 'bank' | 'credit_card' | 'digital_wallet' | 'investment' | 'other';

export interface SpaceSummary {
  id: string;
  name: string;
  type: SpaceType;
  baseCurrency: string;
  role: MemberRole;
}

/** Fila de la vista determinista `account_balances` (nunca calculada por IA). */
export interface AccountBalance {
  accountId: string;
  spaceId: string;
  name: string;
  type: AccountType;
  currency: string;
  isActive: boolean;
  /** Saldo consolidado en la moneda base del espacio. */
  currentBalance: number;
  /** Suma cruda en la moneda propia de la cuenta (sin conversion). */
  currentBalanceOriginal: number;
}

export interface AccountBalancesData {
  baseCurrency: string;
  accounts: AccountBalance[];
}

/** Resumen de una transaccion en estado pending_confirmation para la bandeja de revision. */
export interface PendingTransactionSummary {
  id: string;
  type: TransactionType;
  status: RecordStatus;
  source: CaptureSource;
  description: string | null;
  amountOriginal: number;
  currencyOriginal: string;
  confidenceScore: number | null;
  uncertainties: string[];
  accountId: string | null;
  categoryId: string | null;
  transactionDate: string;
  receiptId: string | null;
  createdAt: string;
  /** Pregunta breve de la IA cuando la entrada es ambigua entre dos clasificaciones plausibles; null si no aplica. */
  clarificationQuestion: string | null;
}

/** Fila del historial de movimientos confirmados (pantalla de consulta, /settings). */
export interface TransactionHistoryItem {
  id: string;
  type: TransactionType;
  description: string | null;
  amountOriginal: number;
  currencyOriginal: string;
  categoryName: string | null;
  transactionDate: string;
}

export type PlanTier = 'free' | 'pro' | 'premium';
export type SubscriptionStatus = 'active' | 'inactive' | 'canceled';

/** Plan del usuario. Se activa manualmente (sin cobro real todavia); ver 0008_subscriptions.sql. */
export interface SubscriptionSummary {
  plan: PlanTier;
  status: SubscriptionStatus;
  maxSpaces: number | null;
  maxMonthlyRecords: number | null;
  maxStorageMb: number | null;
}

export interface CategoryOption {
  id: string;
  name: string;
  kind: 'income' | 'expense';
  isSystem: boolean;
}

/** Miembro de un espacio para la vista de /settings. El nombre/correo solo es visible entre compania de espacio (ver 0004). */
export interface SpaceMemberSummary {
  userId: string;
  email: string;
  fullName: string | null;
  role: MemberRole;
  joinedAt: string;
}
