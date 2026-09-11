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

/**
 * Inteligencia para Microemprendimientos: verdades operativas directas
 * calculadas solo sobre movimientos CONFIRMADOS marcados como negocio
 * (is_business = true) dentro del espacio. null cuando no hay suficiente
 * historial de negocio como para que el patron signifique algo real.
 */
export interface BusinessCashInsight {
  /** Ej. "viernes y sabado" -- el/los dia(s) de la semana con mas ingresos de negocio. null si aun no hay un patron claro. */
  peakDaysLabel: string | null;
  /** Ingresos - egresos de negocio en lo que va del mes calendario, en moneda base. */
  operatingNetFlow: number;
}

/** Un ingreso o gasto recurrente detectado (salario, arriendo, suscripcion) usado para proyectar hacia adelante. */
export interface RecurringCashEvent {
  key: string;
  description: string;
  type: TransactionType;
  averageAmount: number;
  /** Proxima fecha en la que se espera este evento, ISO 8601. */
  nextExpectedDate: string;
}

/** Un evento recurrente ya ubicado dentro de la ventana de proyeccion, con el saldo acumulado hasta ese punto. */
export interface ProjectedCashEvent extends RecurringCashEvent {
  /** Saldo proyectado inmediatamente despues de este evento. */
  balanceAfter: number;
}

/**
 * Proyeccion deterministica de caja a 30 dias: saldo actual + eventos
 * recurrentes ya detectados (nunca una prediccion generada por IA). Responde
 * "¿como estara mi caja el proximo mes?" con matematica simple sobre
 * patrones ya confirmados -- si no hay suficientes patrones, el resultado es
 * simplemente el saldo actual sostenido, nunca un numero inventado.
 */
export interface CashFlowProjection {
  currentBalance: number;
  /** Saldo proyectado al final de la ventana (dia 30), asumiendo solo los eventos recurrentes detectados. */
  projectedBalance30d: number;
  /** Eventos recurrentes esperados dentro de la ventana, en orden cronologico. */
  upcomingEvents: ProjectedCashEvent[];
  /** El punto mas bajo que tocaria el saldo dentro de la ventana (y su fecha) -- la pregunta real detras de "¿me alcanza?". */
  lowestPoint: { date: string; balance: number } | null;
}
