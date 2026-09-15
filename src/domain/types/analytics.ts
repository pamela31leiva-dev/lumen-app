import type { TransactionType } from '@/domain/types/capture';
import type { Folder } from '@/domain/folders';

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
  /**
   * 'fixed' = evento garantizado, registrado explicitamente (ingreso fijo,
   * ver recurring_incomes 0019; o factura pendiente, ver bills 0017/0026) --
   * confiable desde el primer mes, sin esperar 2+ ocurrencias historicas.
   * 'detected' = inferido por heuristica sobre el historico confirmado
   * (detectRecurringCashEvents). La interfaz distingue ambos para que un
   * evento garantizado nunca se confunda con un gasto esporadico que solo
   * coincidio dos veces por casualidad.
   */
  source: 'fixed' | 'detected';
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
  /** Saldo proyectado al final de la ventana, asumiendo solo los eventos recurrentes detectados. */
  projectedBalance30d: number;
  /** Eventos recurrentes esperados dentro de la ventana, en orden cronologico. */
  upcomingEvents: ProjectedCashEvent[];
  /** El punto mas bajo que tocaria el saldo dentro de la ventana (y su fecha) -- la pregunta real detras de "¿me alcanza?". */
  lowestPoint: { date: string; balance: number } | null;
  /** Dias de la ventana proyectada -- 30 por defecto, 90 para espacios is_pro (Niveles Avanzados). */
  horizonDays: number;
}

/** Un segmento de la Radiografia Proporcional: gasto del mes en curso por carpeta. */
export interface FolderDistributionSlice {
  folder: Folder;
  total: number;
}

/** Un punto del mapa de calor de gasto por dia de la semana (0=domingo .. 6=sabado), ultimos 90 dias. */
export interface WeekdayHeatPoint {
  weekday: number;
  total: number;
}

/**
 * Auditoria de Anomalias (nivel avanzado / is_pro): un gasto confirmado que
 * supera 2.5x el promedio de su propia categoria en los ultimos 90 dias --
 * calculado en Postgres (GROUP BY + AVG), nunca inferido por IA.
 */
export interface AnomalyFlag {
  id: string;
  description: string | null;
  amountBase: number;
  categoryName: string;
  transactionDate: string;
  categoryAvg: number;
}

/**
 * Un punto de la Historia Financiera (Bloque P3): saldo acumulado a fin de
 * ese mes (activos/pasivos/patrimonio neto) + ingreso/gasto ocurrido DURANTE
 * ese mes. Todo calculado en Postgres (get_financial_history, 0028) sobre el
 * ledger de transacciones confirmadas -- nunca un snapshot periodico que
 * podria desincronizarse.
 */
export interface FinancialHistoryPoint {
  /** Primer dia del mes (o del trimestre, tras resamplear), ISO 8601 (solo fecha). */
  periodStart: string;
  /** Suma de cuentas que no son tarjeta de credito, a fin de este periodo. */
  assets: number;
  /** Deuda de tarjeta de credito (magnitud positiva), a fin de este periodo. */
  liabilities: number;
  netWorth: number;
  income: number;
  expense: number;
}

/**
 * KPIs financieros derivados (Bloque P3) -- Postgres ya sumo los numeros
 * crudos en FinancialHistoryPoint; esto solo calcula la razon/porcentaje,
 * igual que computeBusinessCashInsight. null cuando el KPI no tiene sentido
 * todavia (ej. tasa de ahorro sin ingresos ese mes).
 */
export interface FinancialKpis {
  /** (ingreso - gasto) / ingreso del mes mas reciente, en %. null si no hubo ingreso ese mes. */
  savingsRatePercent: number | null;
  /** Activos liquidos / gasto mensual promedio (ultimos 3 meses con gasto) -- "meses de colchon". null sin gasto historico. */
  liquidityMonths: number | null;
  /** Pasivos / activos del mes mas reciente, en %. 0 si no hay deuda; null si tampoco hay activos contra que medirla. */
  debtRatioPercent: number | null;
}
