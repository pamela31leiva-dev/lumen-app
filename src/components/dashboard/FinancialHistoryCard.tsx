'use client';

import { useState } from 'react';
import type { FinancialHistoryPoint } from '@/domain/types/analytics';
import { cn, formatMoney } from '@/lib/utils';

interface FinancialHistoryCardProps {
  monthly: FinancialHistoryPoint[];
  quarterly: FinancialHistoryPoint[];
  baseCurrency: string;
}

type Granularity = 'monthly' | 'quarterly';

// timeZone: 'UTC' es obligatorio aqui -- period_start llega como fecha pura
// ("2026-09-01") sin hora, que Date la interpreta como medianoche UTC. Sin
// fijar la zona, formatear en un huso horario detras de UTC (ej. Colombia,
// UTC-5) mostraria "agosto" para el 1 de septiembre.
const MONTH_FORMAT = new Intl.DateTimeFormat('es-CO', { month: 'short', year: 'numeric', timeZone: 'UTC' });

function quarterLabel(isoDate: string): string {
  const d = new Date(isoDate);
  const quarter = Math.floor(d.getUTCMonth() / 3) + 1;
  return `T${quarter} ${d.getUTCFullYear()}`;
}

/**
 * Historia Financiera (Bloque P3): comparativa mensual/trimestral de
 * activos, pasivos y patrimonio neto -- texto y una lista, nunca un grafico
 * (mismo lenguaje visual que CashFlowProjectionCard y HistoricalPanoramaCard).
 * Colapsada por defecto (Cero Ruido), con un selector de granularidad porque
 * "mensual" y "trimestral" responden preguntas distintas (¿que paso el mes
 * pasado? vs. ¿hacia donde voy este año?).
 */
export function FinancialHistoryCard({ monthly, quarterly, baseCurrency }: FinancialHistoryCardProps) {
  const [granularity, setGranularity] = useState<Granularity>('monthly');
  const points = granularity === 'monthly' ? monthly : quarterly;
  const label = (iso: string) => (granularity === 'monthly' ? MONTH_FORMAT.format(new Date(iso)) : quarterLabel(iso));

  if (points.length < 2) return null;

  const reversed = [...points].reverse();

  return (
    <details className="group rounded-xl border border-white/10 bg-elevated open:pb-5 transition-colors hover:border-gold/15">
      <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-5 py-4 text-sm font-medium text-stone-300 marker:content-none">
        <span className="inline-flex items-center gap-2">
          Historia Financiera
          <span className="text-stone-600 transition-transform group-open:rotate-90">›</span>
        </span>
      </summary>
      <div className="px-5">
        <div className="mb-3 flex gap-1.5">
          {(['monthly', 'quarterly'] as const).map((g) => (
            <button
              key={g}
              type="button"
              onClick={(e) => {
                e.preventDefault();
                setGranularity(g);
              }}
              className={cn(
                'rounded-full px-3 py-1 text-xs font-medium transition',
                granularity === g ? 'bg-gold/15 text-gold' : 'text-stone-500 hover:text-stone-300',
              )}
            >
              {g === 'monthly' ? 'Mensual' : 'Trimestral'}
            </button>
          ))}
        </div>

        <ul className="flex flex-col divide-y divide-white/10">
          {reversed.map((point, i) => {
            const previous = reversed[i + 1];
            const delta = previous ? point.netWorth - previous.netWorth : null;
            return (
              <li key={point.periodStart} className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 py-3">
                <span className="text-sm font-medium capitalize text-stone-100">{label(point.periodStart)}</span>
                <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs">
                  <span className="text-stone-400">
                    Activos <span className="amount text-stone-200">{formatMoney(point.assets, baseCurrency)}</span>
                  </span>
                  {point.liabilities > 0 && (
                    <span className="text-stone-400">
                      Pasivos <span className="amount text-amber-300">{formatMoney(point.liabilities, baseCurrency)}</span>
                    </span>
                  )}
                  <span className={cn('amount font-medium', point.netWorth < 0 ? 'text-amber-300' : 'text-stone-100')}>
                    {formatMoney(point.netWorth, baseCurrency)}
                  </span>
                  {delta !== null && (
                    <span className={cn('text-[11px]', delta < 0 ? 'text-amber-400' : 'text-growth')}>
                      {delta >= 0 ? '▲' : '▼'} {formatMoney(Math.abs(delta), baseCurrency)}
                    </span>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      </div>
    </details>
  );
}
