import type { YearlySummary } from '@/actions/history';
import { cn, formatMoney } from '@/lib/utils';

interface HistoricalPanoramaCardProps {
  years: YearlySummary[];
  baseCurrency: string;
}

/**
 * "Panorama Historico": comparar años completos de un vistazo, sin saturar
 * la pantalla principal -- vive colapsado por defecto (Cero Ruido), igual
 * que "Detalle por cuenta". Solo se renderiza (ver executive-board/page.tsx)
 * cuando hay 2+ años con datos: comparar contra un solo año no es una
 * comparacion. Ambar (nunca rojo) para el año que cerro en negativo.
 */
export function HistoricalPanoramaCard({ years, baseCurrency }: HistoricalPanoramaCardProps) {
  return (
    <details className="group rounded-xl border border-white/10 bg-elevated open:pb-5 transition-colors hover:border-gold/15">
      <summary className="cursor-pointer list-none px-5 py-4 text-sm font-medium text-stone-300 marker:content-none">
        <span className="inline-flex items-center gap-2">
          Panorama Historico
          <span className="text-stone-600 transition-transform group-open:rotate-90">›</span>
        </span>
      </summary>
      <div className="px-5">
        <ul className="flex flex-col divide-y divide-white/10">
          {years.map((year) => (
            <li key={year.year} className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 py-3">
              <span className="text-sm font-medium text-stone-100">{year.year}</span>
              <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs">
                <span className="text-stone-400">
                  Ingresos <span className="amount text-stone-200">{formatMoney(year.totalIncome, baseCurrency)}</span>
                </span>
                <span className="text-stone-400">
                  Gastos <span className="amount text-stone-200">{formatMoney(year.totalExpense, baseCurrency)}</span>
                </span>
                <span className={cn('amount font-medium', year.netFlow < 0 ? 'text-amber-300' : 'text-growth')}>
                  {formatMoney(year.netFlow, baseCurrency)}
                </span>
              </div>
            </li>
          ))}
        </ul>
      </div>
    </details>
  );
}
