'use client';

import { useEffect, useState } from 'react';
import { getFiscalSummary } from '@/actions/fiscal';
import type { FiscalSummary } from '@/domain/types/fiscal';
import { formatMoney } from '@/lib/utils';

interface FiscalSummaryCardProps {
  spaceId: string;
  baseCurrency: string;
  initialSummary: FiscalSummary;
}

interface FiscalRow {
  label: string;
  value: number;
}

/**
 * Resumen Fiscal (Bloque P5): suma lo que la persona YA clasifico
 * (Ajustes > Clasificacion Tributaria) y las retenciones que ya declaro al
 * confirmar ingresos -- Lumen nunca calcula impuesto ni decide una
 * clasificacion. Colapsado por defecto (Cero Ruido), navegable por año igual
 * que el Reporte Mensual. El aviso de "sin clasificar" es la señal mas
 * importante de la tarjeta: sin eso, un consolidado fiscal incompleto se
 * veria igual de limpio que uno completo, lo cual seria peor que no mostrar nada.
 */
export function FiscalSummaryCard({ spaceId, baseCurrency, initialSummary }: FiscalSummaryCardProps) {
  const [year, setYear] = useState(initialSummary.year);
  const [summary, setSummary] = useState(initialSummary);
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    if (year === initialSummary.year) {
      setSummary(initialSummary);
      return;
    }
    let cancelled = false;
    setIsLoading(true);
    getFiscalSummary(spaceId, year).then((result) => {
      if (cancelled) return;
      setSummary(result);
      setIsLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, [year, spaceId, initialSummary]);

  const incomeRows: FiscalRow[] = [
    { label: 'Ingresos gravados', value: summary.incomeGravado },
    { label: 'Ingresos exentos', value: summary.incomeExento },
    { label: 'Ingresos no gravados', value: summary.incomeNoGravado },
  ];
  const expenseRows: FiscalRow[] = [
    { label: 'Gastos deducibles', value: summary.expenseDeducible },
    { label: 'Gastos no deducibles', value: summary.expenseNoDeducible },
  ];
  const hasUnclassified = summary.incomeUnclassified > 0 || summary.expenseUnclassified > 0;

  return (
    <details className="group rounded-xl border border-white/10 bg-elevated open:pb-5 transition-colors hover:border-gold/15">
      <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-5 py-4 text-sm font-medium text-stone-300 marker:content-none">
        <span className="inline-flex items-center gap-2">
          Resumen Fiscal
          <span className="text-stone-600 transition-transform group-open:rotate-90">›</span>
        </span>
      </summary>
      <div className="px-5">
        <div className="mb-3 flex items-center gap-3">
          <button
            type="button"
            onClick={(e) => {
              e.preventDefault();
              setYear((y) => y - 1);
            }}
            className="text-stone-500 hover:text-stone-200"
            aria-label="Año anterior"
          >
            ‹
          </button>
          <span className="text-sm font-medium text-stone-100">{year}</span>
          <button
            type="button"
            onClick={(e) => {
              e.preventDefault();
              setYear((y) => y + 1);
            }}
            className="text-stone-500 hover:text-stone-200"
            aria-label="Año siguiente"
          >
            ›
          </button>
          {isLoading && <span className="text-xs text-stone-600">Calculando...</span>}
        </div>

        <ul className="flex flex-col divide-y divide-white/10">
          {[...incomeRows, ...expenseRows].map((row) => (
            <li key={row.label} className="flex items-center justify-between gap-3 py-2 text-sm">
              <span className="text-stone-400">{row.label}</span>
              <span className="amount text-stone-200">{formatMoney(row.value, baseCurrency)}</span>
            </li>
          ))}
          <li className="flex items-center justify-between gap-3 py-2 text-sm">
            <span className="text-stone-400">Retenciones declaradas</span>
            <span className="amount font-medium text-stone-100">{formatMoney(summary.withholdingTaxTotal, baseCurrency)}</span>
          </li>
        </ul>

        {hasUnclassified && (
          <p className="mt-3 rounded-lg border border-gold/30 bg-gold/10 px-3 py-2 text-xs text-gold">
            Tienes {formatMoney(summary.incomeUnclassified + summary.expenseUnclassified, baseCurrency)} en movimientos
            de {year} sin clasificacion fiscal todavia. Clasifica sus categorias en Ajustes para que este resumen quede
            completo.
          </p>
        )}
      </div>
    </details>
  );
}
