import type { TransactionType } from '@/domain/types/capture';

/** Forma minima que el motor de patrones necesita de una transaccion — no acopla el dominio a Supabase. */
export interface TransactionForAnalytics {
  description: string | null;
  amountOriginal: number;
  type: TransactionType;
  transactionDate: string; // ISO 8601
}

/**
 * Un gasto que se repite con cadencia mensual (arriendo, cuota, suscripcion)
 * detectado a partir de transacciones ya CONFIRMADAS — nunca de pendientes,
 * para no construir una prediccion sobre datos que la persona aun no valido.
 */
export interface RecurringObligation {
  /** Descripcion normalizada, usada como identificador estable del grupo. */
  key: string;
  description: string;
  averageAmount: number;
  occurrences: number;
  expectedDayOfMonth: number;
  lastOccurrenceDate: string;
  nextExpectedDate: string;
  isOverdue: boolean;
  daysOverdue: number;
}

export interface ProactiveInsights {
  recurringObligations: RecurringObligation[];
  hasActivityToday: boolean;
  /** "Dias de Claridad": dias consecutivos (hasta hoy, o hasta ayer si hoy aun no tiene movimiento) con al menos una transaccion confirmada. */
  activityStreakDays: number;
}
