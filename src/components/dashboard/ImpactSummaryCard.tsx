import type { ImpactSummary } from '@/domain/types/dashboard';

function formatAmount(amount: number, currency: string) {
  return `${Math.round(amount).toLocaleString('es-CO')} ${currency}`;
}

/**
 * Tarjeta visual del Resumen de Impacto ("Tu año en numeros") — estilo
 * Spotify Wrapped, pensada para verse bien en una captura de pantalla o al
 * compartirse. Puramente presentacional: recibe los numeros ya calculados
 * por getImpactSummary() (deterministico, nunca generado por IA).
 */
export function ImpactSummaryCard({ summary }: { summary: ImpactSummary }) {
  const maxCategoryAmount = summary.topExpenseCategories[0]?.totalAmount ?? 1;

  return (
    <div
      id="impact-summary-card"
      className="mx-auto w-full max-w-sm overflow-hidden rounded-2xl border border-gold/20 bg-gradient-to-b from-elevated to-obsidian p-6 text-stone-100 shadow-2xl shadow-black/50"
    >
      <p className="text-[11px] uppercase tracking-[0.2em] text-gold">Lumen · Resumen de Impacto</p>
      <h2 className="mt-1 text-xl font-semibold">{summary.spaceName}</h2>
      <p className="text-xs text-stone-500">{summary.periodLabel}</p>

      <div className="mt-6">
        <p className="text-xs text-stone-500">Total gastado</p>
        <p className="amount text-3xl font-bold text-stone-50">{formatAmount(summary.totalExpense, summary.baseCurrency)}</p>
        {summary.totalIncome > 0 && (
          <p className="amount mt-1 text-sm text-growth">+{formatAmount(summary.totalIncome, summary.baseCurrency)} en ingresos</p>
        )}
      </div>

      {summary.topExpenseCategories.length > 0 && (
        <div className="mt-6">
          <p className="text-xs text-stone-500">Tus categorias mas fuertes</p>
          <div className="mt-2 flex flex-col gap-2">
            {summary.topExpenseCategories.map((cat, i) => (
              <div key={cat.name}>
                <div className="flex items-center justify-between text-sm">
                  <span className="text-stone-200">
                    {i + 1}. {cat.name}
                  </span>
                  <span className="amount text-stone-400">{formatAmount(cat.totalAmount, summary.baseCurrency)}</span>
                </div>
                <div className="mt-1 h-1.5 w-full rounded-full bg-white/5">
                  <div
                    className="h-1.5 rounded-full bg-gold"
                    style={{ width: `${Math.max(6, (cat.totalAmount / maxCategoryAmount) * 100)}%` }}
                  />
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="mt-6 grid grid-cols-2 gap-3">
        {summary.biggestExpense && (
          <div className="rounded-lg border border-white/10 bg-white/5 p-3">
            <p className="text-[10px] uppercase tracking-wide text-stone-500">Mayor gasto</p>
            <p className="amount mt-1 text-sm font-medium text-stone-100">
              {formatAmount(summary.biggestExpense.amount, summary.baseCurrency)}
            </p>
            <p className="truncate text-[11px] text-stone-500">{summary.biggestExpense.description ?? 'Sin descripcion'}</p>
          </div>
        )}
        {summary.busiestMonth && (
          <div className="rounded-lg border border-white/10 bg-white/5 p-3">
            <p className="text-[10px] uppercase tracking-wide text-stone-500">Mes con mas movimiento</p>
            <p className="mt-1 text-sm font-medium capitalize text-stone-100">{summary.busiestMonth.label}</p>
            <p className="text-[11px] text-stone-500">{summary.busiestMonth.transactionCount} movimientos</p>
          </div>
        )}
      </div>

      <div className="mt-6 flex items-center justify-between border-t border-white/10 pt-4 text-xs text-stone-500">
        <span>{summary.transactionCount} movimientos registrados</span>
        <span>{summary.activeDayCount} dias activos</span>
      </div>

      <p className="mt-4 text-center text-[10px] text-stone-600">Hecho con Lumen — Inteligencia Patrimonial</p>
    </div>
  );
}
