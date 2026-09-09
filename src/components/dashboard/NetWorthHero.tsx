import { formatMoney } from '@/lib/utils';

interface NetWorthHeroProps {
  baseCurrency: string;
  totalBalance: number;
}

/**
 * Bloque (a) del Executive Action Board: el Balance Maestro. Numero grande,
 * calculado deterministicamente por Postgres (account_balances), nunca por IA.
 * "Trayectoria y Control" es la etiqueta conceptual del indicador de
 * trayectoria — una cifra de tendencia real (vs. mes anterior) es un
 * siguiente paso natural que requeriria una serie historica de saldos.
 */
export function NetWorthHero({ baseCurrency, totalBalance }: NetWorthHeroProps) {
  return (
    <section className="rounded-xl border border-white/10 bg-elevated p-6 transition-colors hover:border-gold/15">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <p className="text-[11px] font-medium uppercase tracking-[0.2em] text-stone-500">Trayectoria y Control</p>
          <h2 className="mt-1 text-base font-semibold text-gold">Patrimonio Neto</h2>
          <p className="amount mt-2 text-4xl font-bold text-stone-50">{formatMoney(totalBalance, baseCurrency)}</p>
        </div>
        <span className="inline-flex items-center gap-1.5 rounded-full border border-growth/40 bg-growth/10 px-3 py-1 text-xs font-medium text-growth">
          <span className="h-1.5 w-1.5 rounded-full bg-growth" />
          Calculo deterministico · cero estimaciones por IA
        </span>
      </div>
    </section>
  );
}
