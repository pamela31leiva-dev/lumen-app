import type { BusinessCashInsight, RecurringObligation, TransactionForAnalytics } from '@/domain/types/analytics';

/**
 * Deteccion de recurrencias — heuristica deliberadamente simple para un
 * primer motor de inteligencia proactiva:
 *   - Agrupa gastos CONFIRMADOS por descripcion normalizada exacta (no hace
 *     fuzzy matching; "Arriendo enero" y "Arriendo" no se agrupan entre si —
 *     limitacion conocida, mejorable a futuro con similitud de texto).
 *   - Solo considera un grupo "recurrente" si tiene 2+ ocurrencias, montos
 *     estables (dentro de un 15% entre si) y al menos un espaciado de ~1 mes
 *     entre dos ocurrencias consecutivas.
 * Pura y sin dependencias de framework: se ejecuta en el servidor
 * (Server Action) sobre datos ya confirmados, nunca sobre pendientes —
 * el motor de patrones no alucina sobre datos que la persona no valido.
 */

const MIN_OCCURRENCES = 2;
const AMOUNT_TOLERANCE_RATIO = 1.15;
const MIN_GAP_DAYS = 24;
const MAX_GAP_DAYS = 36;
const GRACE_DAYS = 3;
const DAY_MS = 86_400_000;

function normalizeDescription(raw: string): string {
  return raw.trim().toLowerCase().replace(/\s+/g, ' ');
}

function dayOfMonth(iso: string): number {
  return new Date(iso).getUTCDate();
}

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
}

function addApproxMonth(iso: string, expectedDay: number): Date {
  const d = new Date(iso);
  const next = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 1));
  const daysInNextMonth = new Date(Date.UTC(next.getUTCFullYear(), next.getUTCMonth() + 1, 0)).getUTCDate();
  next.setUTCDate(Math.min(expectedDay, daysInNextMonth));
  return next;
}

export function detectRecurringObligations(
  transactions: TransactionForAnalytics[],
  referenceDate: Date = new Date(),
): RecurringObligation[] {
  const groups = new Map<string, TransactionForAnalytics[]>();

  for (const tx of transactions) {
    if (tx.type !== 'expense' || !tx.description) continue;
    const key = normalizeDescription(tx.description);
    if (!key) continue;
    const list = groups.get(key) ?? [];
    list.push(tx);
    groups.set(key, list);
  }

  const obligations: RecurringObligation[] = [];

  for (const [key, txs] of groups) {
    if (txs.length < MIN_OCCURRENCES) continue;

    const sorted = [...txs].sort(
      (a, b) => new Date(a.transactionDate).getTime() - new Date(b.transactionDate).getTime(),
    );
    const amounts = sorted.map((t) => t.amountOriginal);
    const maxAmount = Math.max(...amounts);
    const minAmount = Math.min(...amounts);
    if (minAmount <= 0 || maxAmount / minAmount > AMOUNT_TOLERANCE_RATIO) continue;

    let hasMonthlyGap = false;
    for (let i = 1; i < sorted.length; i++) {
      const gapDays =
        (new Date(sorted[i].transactionDate).getTime() - new Date(sorted[i - 1].transactionDate).getTime()) / DAY_MS;
      if (gapDays >= MIN_GAP_DAYS && gapDays <= MAX_GAP_DAYS) {
        hasMonthlyGap = true;
        break;
      }
    }
    if (!hasMonthlyGap) continue;

    const last = sorted[sorted.length - 1];
    const expectedDay = Math.round(median(sorted.map((t) => dayOfMonth(t.transactionDate))));
    const averageAmount = Math.round((amounts.reduce((sum, a) => sum + a, 0) / amounts.length) * 100) / 100;
    const nextExpected = addApproxMonth(last.transactionDate, expectedDay);

    const daysOverdueRaw = Math.floor((referenceDate.getTime() - nextExpected.getTime()) / DAY_MS) - GRACE_DAYS;

    obligations.push({
      key,
      description: last.description ?? key,
      averageAmount,
      occurrences: sorted.length,
      expectedDayOfMonth: expectedDay,
      lastOccurrenceDate: last.transactionDate,
      nextExpectedDate: nextExpected.toISOString(),
      isOverdue: daysOverdueRaw > 0,
      daysOverdue: Math.max(0, daysOverdueRaw),
    });
  }

  return obligations.sort((a, b) => b.daysOverdue - a.daysOverdue);
}

/** true si alguna de las fechas dadas cae en el mismo dia (UTC) que referenceDate. */
export function hasTransactionOnDate(transactionDates: string[], referenceDate: Date = new Date()): boolean {
  const refKey = referenceDate.toISOString().slice(0, 10);
  return transactionDates.some((iso) => iso.slice(0, 10) === refKey);
}

/**
 * "Dias de Claridad": dias consecutivos con al menos un movimiento
 * confirmado, contando hacia atras desde hoy. Si hoy todavia no tiene
 * ningun movimiento, cuenta desde ayer -- de otro modo la racha se veria en
 * cero cada mañana antes de que la persona alcance a registrar algo, lo que
 * se sentiria como un castigo en vez de un reconocimiento del habito. Sin
 * penalizacion visible por un dia saltado: simplemente no crece, nunca se
 * muestra en rojo ni se resetea con aviso.
 */
export function computeActivityStreak(transactionDates: string[], referenceDate: Date = new Date()): number {
  const activeDays = new Set(transactionDates.map((iso) => iso.slice(0, 10)));
  const cursor = new Date(referenceDate);
  const todayKey = cursor.toISOString().slice(0, 10);

  if (!activeDays.has(todayKey)) {
    cursor.setUTCDate(cursor.getUTCDate() - 1);
  }

  let streak = 0;
  while (activeDays.has(cursor.toISOString().slice(0, 10))) {
    streak++;
    cursor.setUTCDate(cursor.getUTCDate() - 1);
  }
  return streak;
}

const DAY_LABELS = ['domingo', 'lunes', 'martes', 'miercoles', 'jueves', 'viernes', 'sabado'];
const MIN_BUSINESS_TRANSACTIONS = 3;
const MIN_INCOME_FOR_PEAK_DAY = 5;
const MIN_DISTINCT_DAYS_FOR_PEAK = 2;
// Un segundo dia se incluye en el "pico" solo si esta razonablemente cerca
// del primero -- si no, mencionarlo exagera un patron que no es tan claro.
const SECOND_DAY_THRESHOLD_RATIO = 0.7;

interface BusinessTransactionRow {
  type: 'income' | 'expense' | 'transfer';
  amountBase: number;
  transactionDate: string; // ISO 8601
}

function formatPeakDaysLabel(rankedDays: { day: number; total: number }[]): string | null {
  if (rankedDays.length === 0) return null;
  const [first, second] = rankedDays;
  const includeSecond = second && second.total >= first.total * SECOND_DAY_THRESHOLD_RATIO;
  return includeSecond ? `${DAY_LABELS[first.day]} y ${DAY_LABELS[second.day]}` : DAY_LABELS[first.day];
}

/**
 * "Picos de Venta y Salud de Caja" -- Inteligencia para Microemprendimientos.
 * Solo opera sobre transacciones ya marcadas is_business=true y CONFIRMADAS
 * (nunca pendientes): verdades operativas directas, no graficos contables ni
 * alarmas. Devuelve null cuando no hay suficiente historial de negocio como
 * para que decir algo sea mas que ruido -- silencio es mejor que un patron
 * inventado sobre 1 o 2 movimientos.
 */
export function computeBusinessCashInsight(
  transactions: BusinessTransactionRow[],
  referenceDate: Date = new Date(),
): BusinessCashInsight | null {
  if (transactions.length < MIN_BUSINESS_TRANSACTIONS) return null;

  const incomeRows = transactions.filter((t) => t.type === 'income');
  const totalsByDay = new Map<number, number>();
  for (const row of incomeRows) {
    const day = new Date(row.transactionDate).getUTCDay();
    totalsByDay.set(day, (totalsByDay.get(day) ?? 0) + row.amountBase);
  }

  let peakDaysLabel: string | null = null;
  if (incomeRows.length >= MIN_INCOME_FOR_PEAK_DAY && totalsByDay.size >= MIN_DISTINCT_DAYS_FOR_PEAK) {
    const ranked = Array.from(totalsByDay.entries())
      .map(([day, total]) => ({ day, total }))
      .sort((a, b) => b.total - a.total);
    peakDaysLabel = formatPeakDaysLabel(ranked);
  }

  const monthStart = new Date(Date.UTC(referenceDate.getUTCFullYear(), referenceDate.getUTCMonth(), 1));
  const operatingNetFlow = transactions
    .filter((t) => new Date(t.transactionDate) >= monthStart)
    .reduce((sum, t) => sum + (t.type === 'income' ? t.amountBase : t.type === 'expense' ? -t.amountBase : 0), 0);

  return { peakDaysLabel, operatingNetFlow };
}
