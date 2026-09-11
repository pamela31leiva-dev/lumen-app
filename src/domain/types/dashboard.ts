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
  /** Solo relevante para espacios type='business': desbloquea analitica de negocio avanzada (Picos de Venta, proyeccion, exportacion). Activacion manual, sin pasarela de pago todavia. */
  isPro: boolean;
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
  /** Saldo inicial declarado por el usuario (en la moneda propia de la cuenta). */
  openingBalance: number;
}

export interface AccountBalancesData {
  baseCurrency: string;
  accounts: AccountBalance[];
  /**
   * true si al menos una cuenta tiene saldo inicial (opening_balance) > 0 --
   * es decir, el usuario declaro activos reales. Sin esto, "Patrimonio Neto"
   * no tiene sentido: un gasto suelto de bolsillo contra una cuenta en $0 no
   * es una deuda, es solo que todavia no se registro cuanto dinero real hay.
   */
  hasRealAssets: boolean;
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
  /** Opciones de un toque para responder clarificationQuestion (ej. ["Gasto","Ingreso"]); [] = respuesta en texto libre. */
  clarificationOptions: string[];
  /** Etiquetas de subproyecto detectadas o editadas (ej. "lonchera", "matricula"). */
  tags: string[];
  /** Espacio donde la IA cree que este movimiento encaja mejor, si es distinto al activo. */
  suggestedSpaceId: string | null;
  suggestedSpaceName: string | null;
  /** Naturaleza Negocio (true) vs Personal (false, default) -- ver is_business en AiExtractionResult. */
  isBusiness: boolean;
  /** Carpeta dentro de lo no-negocio: Personal (null)/Familiar/Salud -- ver life_domain en AiExtractionResult. */
  lifeDomain: 'personal' | 'familiar' | 'salud' | null;
}

/** Fila del historial de movimientos confirmados (pantalla de consulta, /settings). */
export interface TransactionHistoryItem {
  id: string;
  type: TransactionType;
  description: string | null;
  amountOriginal: number;
  currencyOriginal: string;
  categoryId: string | null;
  categoryName: string | null;
  transactionDate: string;
  tags: string[];
  /** Naturaleza Negocio (true) vs Personal (false, default) -- ver is_business en AiExtractionResult. */
  isBusiness: boolean;
  /** Carpeta dentro de lo no-negocio: Personal (null)/Familiar/Salud -- ver life_domain en AiExtractionResult. */
  lifeDomain: 'personal' | 'familiar' | 'salud' | null;
}

/** Una entrada del ranking "top categoria" del Resumen de Impacto. */
export interface ImpactTopCategory {
  name: string;
  totalAmount: number;
  transactionCount: number;
}

/**
 * "Tu año/mes en numeros" — estructura base para la tarjeta compartible de
 * impacto (estilo Spotify Wrapped). Calculada sobre transacciones CONFIRMADAS
 * de un espacio en un periodo; nunca sobre pendientes.
 */
export interface ImpactSummary {
  spaceName: string;
  baseCurrency: string;
  periodLabel: string; // ej. "Ultimos 12 meses"
  periodStart: string; // ISO 8601
  periodEnd: string; // ISO 8601
  totalIncome: number;
  totalExpense: number;
  transactionCount: number;
  topExpenseCategories: ImpactTopCategory[]; // top 3, mayor a menor
  biggestExpense: { description: string | null; amount: number; date: string } | null;
  busiestMonth: { label: string; transactionCount: number } | null;
  activeDayCount: number; // dias distintos con al menos un movimiento confirmado
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

/**
 * "Asi te conozco" -- lectura calida de lo que Lumen ya aprendio de este
 * espacio, para reforzar el habito (Clarity Loop). Se arma solo con datos ya
 * reales: aprendizajes de clasificacion que el usuario mismo respondio
 * (classification_hints) y la categoria de gasto mas frecuente ya
 * confirmada. Nunca es una inferencia psicologica inventada.
 */
export interface IdentitySnapshot {
  learnedHints: { question: string; answer: string }[];
  topCategoryName: string | null;
  /** 0-100, que porcentaje del gasto confirmado cae en topCategoryName. */
  topCategoryShare: number | null;
}

/** Miembro de un espacio para la vista de /settings. El nombre/correo solo es visible entre compania de espacio (ver 0004). */
export interface SpaceMemberSummary {
  userId: string;
  email: string;
  fullName: string | null;
  role: MemberRole;
  joinedAt: string;
}
