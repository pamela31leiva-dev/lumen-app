import type { CashFlowProjection } from '@/domain/types/analytics';
import { cn, formatMoney } from '@/lib/utils';

interface CashFlowProjectionCardProps {
  projection: CashFlowProjection;
  baseCurrency: string;
}

const WEEKDAY_FORMAT = new Intl.DateTimeFormat('es-CO', { weekday: 'long', day: 'numeric', month: 'short' });

/**
 * Proyeccion de Caja a 30 Dias -- responde "¿como estara mi caja el proximo
 * mes?" con matematica pura sobre patrones recurrentes ya confirmados
 * (ver computeCashFlowProjection). Solo se renderiza (ver
 * executive-board/page.tsx) cuando ya hay al menos un patron detectado --
 * sin eso, "proyectar" seria solo repetir el saldo actual, informacion nula.
 * Texto y una lista corta, nunca un grafico -- mismo lenguaje visual sobrio
 * que el resto del tablero, ambar (nunca rojo) si el punto mas ajustado cae
 * por debajo del saldo de hoy.
 */
export function CashFlowProjectionCard({ projection, baseCurrency }: CashFlowProjectionCardProps) {
  const { currentBalance, projectedBalance30d, upcomingEvents, lowestPoint } = projection;
  const dipsBelow = lowestPoint !== null && lowestPoint.balance < currentBalance;

  return (
    <section className="rounded-xl border border-white/10 bg-elevated p-5 transition-colors hover:border-gold/15">
      <p className="text-[11px] font-medium uppercase tracking-[0.2em] text-stone-500">Proyeccion a 30 Dias</p>

      <p className="mt-2 text-sm text-stone-200">
        Si nada cambia, tu caja estaria en{' '}
        <span className={cn('amount font-medium', projectedBalance30d < 0 ? 'text-amber-300' : 'text-stone-100')}>
          {formatMoney(projectedBalance30d, baseCurrency)}
        </span>{' '}
        dentro de 30 dias.
      </p>

      {lowestPoint && dipsBelow && (
        <p className="mt-1.5 text-sm text-stone-200">
          El punto mas ajustado seria el{' '}
          <span className="font-medium text-stone-100">{WEEKDAY_FORMAT.format(new Date(lowestPoint.date))}</span>, con{' '}
          <span className={cn('amount font-medium', lowestPoint.balance < 0 ? 'text-amber-300' : 'text-stone-100')}>
            {formatMoney(lowestPoint.balance, baseCurrency)}
          </span>
          .
        </p>
      )}

      {upcomingEvents.length > 0 && (
        <ul className="mt-3 flex flex-col gap-1.5 border-t border-white/10 pt-3">
          {upcomingEvents.slice(0, 5).map((event) => (
            <li key={event.key} className="flex items-center justify-between gap-3 text-xs text-stone-400">
              <span className="min-w-0 truncate">
                {WEEKDAY_FORMAT.format(new Date(event.nextExpectedDate))} · {event.description}
              </span>
              <span className={cn('amount shrink-0', event.type === 'income' ? 'text-stone-300' : 'text-stone-500')}>
                {event.type === 'income' ? '+' : '-'}
                {formatMoney(event.averageAmount, baseCurrency)}
              </span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
