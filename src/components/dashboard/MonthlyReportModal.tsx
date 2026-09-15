'use client';

import { useEffect, useState } from 'react';
import { getMonthlyReport, type MonthlyReport } from '@/actions/reports';
import { cn, formatMoney } from '@/lib/utils';

interface MonthlyReportModalProps {
  spaceId: string;
  baseCurrency: string;
}

const MONTH_FORMAT = new Intl.DateTimeFormat('es-CO', { month: 'long', year: 'numeric' });

function monthKey(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-01`;
}

function shiftMonth(date: Date, delta: number): Date {
  return new Date(date.getFullYear(), date.getMonth() + delta, 1);
}

/**
 * Reporte Mensual (Bloque P3): a diferencia de ExportModal (un archivo
 * descargable, snapshot de un periodo elegido), esto es una vista en pantalla
 * SIEMPRE al dia de "como vengo este mes" -- ingresos, gastos y cada
 * categoria contra su presupuesto (ver actions/budgets.ts), navegable mes a
 * mes. Todo el numero viene de get_monthly_report (0028); esto solo formatea.
 */
export function MonthlyReportModal({ spaceId, baseCurrency }: MonthlyReportModalProps) {
  const [open, setOpen] = useState(false);
  const [cursor, setCursor] = useState(() => new Date(new Date().getFullYear(), new Date().getMonth(), 1));
  const [report, setReport] = useState<MonthlyReport | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setIsLoading(true);
    setError(null);
    getMonthlyReport(spaceId, monthKey(cursor)).then((result) => {
      setIsLoading(false);
      if ('error' in result) {
        setError(result.error);
        return;
      }
      setReport(result);
    });
  }, [open, spaceId, cursor]);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="rounded-lg border border-white/10 px-3 py-2 text-xs font-medium text-stone-300 transition hover:border-gold/30 hover:text-gold"
      >
        Ver reporte mensual
      </button>

      {open && (
        <div role="dialog" aria-modal="true" className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <div className="flex max-h-[85vh] w-full max-w-lg flex-col overflow-hidden rounded-xl border border-white/10 bg-elevated shadow-xl">
            <div className="flex items-center justify-between border-b border-white/10 px-6 py-4">
              <div className="flex items-center gap-3">
                <button type="button" onClick={() => setCursor((c) => shiftMonth(c, -1))} className="text-stone-500 hover:text-stone-200" aria-label="Mes anterior">
                  ‹
                </button>
                <h2 className="min-w-[9rem] text-center text-base font-medium capitalize text-stone-100">{MONTH_FORMAT.format(cursor)}</h2>
                <button type="button" onClick={() => setCursor((c) => shiftMonth(c, 1))} className="text-stone-500 hover:text-stone-200" aria-label="Mes siguiente">
                  ›
                </button>
              </div>
              <button type="button" onClick={() => setOpen(false)} className="text-sm text-stone-400 hover:text-stone-200">
                Cerrar
              </button>
            </div>

            <div className="flex-1 overflow-y-auto px-6 py-5">
              {isLoading && <p className="text-sm text-stone-500">Calculando...</p>}
              {error && <p className="text-sm text-red-400">{error}</p>}

              {!isLoading && !error && report && (
                <div className="flex flex-col gap-5">
                  <div className="flex flex-wrap gap-4 text-sm">
                    <div>
                      <p className="text-xs text-stone-500">Ingresos</p>
                      <p className="amount font-medium text-growth">{formatMoney(report.totalIncome, baseCurrency)}</p>
                    </div>
                    <div>
                      <p className="text-xs text-stone-500">Gastos</p>
                      <p className="amount font-medium text-stone-200">{formatMoney(report.totalExpense, baseCurrency)}</p>
                    </div>
                    <div>
                      <p className="text-xs text-stone-500">Flujo neto</p>
                      <p className={cn('amount font-medium', report.netFlow < 0 ? 'text-amber-300' : 'text-stone-100')}>
                        {formatMoney(report.netFlow, baseCurrency)}
                      </p>
                    </div>
                  </div>

                  <div>
                    <p className="mb-2 text-xs font-medium uppercase tracking-wide text-stone-500">Gasto por categoria</p>
                    {report.categories.length === 0 ? (
                      <p className="text-sm text-stone-500">Sin gastos ni presupuestos este mes.</p>
                    ) : (
                      <ul className="flex flex-col gap-3">
                        {report.categories.map((cat) => {
                          const overBudget = cat.budgetPercent !== null && cat.budgetPercent > 100;
                          return (
                            <li key={cat.categoryId}>
                              <div className="flex items-center justify-between gap-3 text-xs">
                                <span className="text-stone-200">{cat.categoryName}</span>
                                <span className="text-stone-400">
                                  {formatMoney(cat.total, baseCurrency)}
                                  {cat.budgetAmount !== null && <span className="text-stone-600"> / {formatMoney(cat.budgetAmount, baseCurrency)}</span>}
                                </span>
                              </div>
                              {cat.budgetAmount !== null && (
                                <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-white/5">
                                  <div
                                    className={cn('h-full rounded-full', overBudget ? 'bg-amber-400' : 'bg-emerald-500')}
                                    style={{ width: `${Math.min(cat.budgetPercent ?? 0, 100)}%` }}
                                  />
                                </div>
                              )}
                              {overBudget && <p className="mt-1 text-[11px] text-amber-400">{cat.budgetPercent}% del presupuesto</p>}
                            </li>
                          );
                        })}
                      </ul>
                    )}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
