import type { AnomalyFlag } from '@/domain/types/analytics';
import { formatMoney } from '@/lib/utils';

interface AnomalyAuditCardProps {
  anomalies: AnomalyFlag[];
  baseCurrency: string;
}

const DATE_FORMAT = new Intl.DateTimeFormat('es-CO', { day: 'numeric', month: 'short' });

/**
 * Auditoria de Anomalias -- nivel avanzado (is_pro): gastos confirmados que
 * superan 2.5x el promedio de su propia categoria en los ultimos 90 dias
 * (calculado en Postgres, ver get_executive_board_snapshot). Nunca una
 * prediccion de IA -- solo aritmetica sobre el propio historico, la misma
 * disciplina que el resto del tablero.
 */
export function AnomalyAuditCard({ anomalies, baseCurrency }: AnomalyAuditCardProps) {
  if (anomalies.length === 0) return null;

  return (
    <section className="rounded-xl border border-amber-500/20 bg-elevated p-5 transition-colors hover:border-amber-500/40">
      <p className="text-[11px] font-medium uppercase tracking-[0.2em] text-amber-400">Auditoria de Anomalias</p>
      <p className="mt-1 text-xs text-stone-500">Gastos muy por encima de tu propio promedio en esa categoria, ultimos 90 dias.</p>

      <ul className="mt-3 flex flex-col gap-2">
        {anomalies.map((a) => {
          const multiplier = a.categoryAvg > 0 ? a.amountBase / a.categoryAvg : 0;
          return (
            <li key={a.id} className="flex items-center justify-between gap-3 rounded-lg border border-white/10 bg-white/5 px-3 py-2">
              <div className="min-w-0">
                <p className="truncate text-sm text-stone-100">{a.description ?? a.categoryName}</p>
                <p className="text-[11px] text-stone-500">
                  {a.categoryName} · {DATE_FORMAT.format(new Date(a.transactionDate))} · promedio {formatMoney(a.categoryAvg, baseCurrency)}
                </p>
              </div>
              <div className="shrink-0 text-right">
                <p className="amount text-sm font-medium text-amber-300">{formatMoney(a.amountBase, baseCurrency)}</p>
                <p className="text-[10px] text-stone-600">{multiplier.toFixed(1)}x el promedio</p>
              </div>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
