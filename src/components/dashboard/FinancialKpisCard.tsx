import type { FinancialKpis } from '@/domain/types/analytics';
import { cn } from '@/lib/utils';

interface FinancialKpisCardProps {
  kpis: FinancialKpis;
}

interface KpiDisplay {
  label: string;
  value: string;
  hint: string;
  isWarning: boolean;
}

function buildDisplays(kpis: FinancialKpis): KpiDisplay[] {
  const displays: KpiDisplay[] = [];

  displays.push({
    label: 'Tasa de ahorro',
    value: kpis.savingsRatePercent === null ? '—' : `${kpis.savingsRatePercent}%`,
    hint: kpis.savingsRatePercent === null ? 'Sin ingresos registrados este mes.' : 'Del ingreso de este mes que no se gasto.',
    isWarning: kpis.savingsRatePercent !== null && kpis.savingsRatePercent < 0,
  });

  displays.push({
    label: 'Colchon de liquidez',
    value: kpis.liquidityMonths === null ? '—' : `${kpis.liquidityMonths} ${kpis.liquidityMonths === 1 ? 'mes' : 'meses'}`,
    hint: kpis.liquidityMonths === null ? 'Aun no hay suficiente historial de gasto.' : 'Cuanto duraria tu saldo liquido al ritmo de gasto reciente.',
    isWarning: kpis.liquidityMonths !== null && kpis.liquidityMonths < 1,
  });

  displays.push({
    label: 'Endeudamiento',
    value: kpis.debtRatioPercent === null ? '—' : `${kpis.debtRatioPercent}%`,
    hint: kpis.debtRatioPercent === null ? 'Sin activos contra que medir la deuda.' : 'Deuda de tarjeta de credito sobre tus activos.',
    isWarning: kpis.debtRatioPercent !== null && kpis.debtRatioPercent > 50,
  });

  return displays;
}

/**
 * KPIs Financieros (Bloque P3): tres razones derivadas de la Historia
 * Financiera (get_financial_history, 0028) -- ningun numero se calcula aqui,
 * solo se formatea (ver domain/analytics/kpis.ts computeFinancialKpis).
 * Ambar (nunca rojo) para el KPI que vale la pena revisar, igual que el
 * resto del tablero.
 */
export function FinancialKpisCard({ kpis }: FinancialKpisCardProps) {
  const displays = buildDisplays(kpis);

  return (
    <section className="card-surface rounded-xl border border-white/10 bg-elevated p-5 transition-colors hover:border-gold/15">
      <p className="text-[11px] font-medium uppercase tracking-[0.2em] text-stone-500">KPIs Financieros</p>
      <div className="mt-3 grid grid-cols-1 gap-4 sm:grid-cols-3">
        {displays.map((kpi) => (
          <div key={kpi.label}>
            <p className="text-xs text-stone-500">{kpi.label}</p>
            <p className={cn('amount mt-1 text-xl font-semibold', kpi.isWarning ? 'text-amber-300' : 'text-stone-100')}>{kpi.value}</p>
            <p className="mt-1 text-[11px] text-stone-600">{kpi.hint}</p>
          </div>
        ))}
      </div>
    </section>
  );
}
