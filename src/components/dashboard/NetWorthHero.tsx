import { cn, formatMoney } from '@/lib/utils';

interface NetWorthHeroProps {
  baseCurrency: string;
  totalBalance: number;
  hasRealAssets: boolean;
  monthlyNetFlow: number;
}

/**
 * Bloque (a) del Executive Action Board: el Balance Maestro. Numero grande,
 * calculado deterministicamente por Postgres (account_balances /
 * getMonthlyNetFlow), nunca por IA.
 *
 * "Patrimonio Neto" solo se muestra cuando el espacio tiene activos reales
 * declarados (una cuenta con saldo inicial > 0). Sin eso, un gasto suelto de
 * bolsillo contra una cuenta recien creada en $0 haria caer el numero a
 * negativo de inmediato -- se lee como "ya estoy endeudado" cuando en
 * realidad solo falta decirle a la app cuanto dinero real hay. En ese caso
 * se muestra "Liquidez del Mes" (el flujo neto de este mes calendario, que
 * se resetea cada mes) con tono neutro en vez de alarma roja.
 */
export function NetWorthHero({ baseCurrency, totalBalance, hasRealAssets, monthlyNetFlow }: NetWorthHeroProps) {
  const label = hasRealAssets ? 'Patrimonio Neto' : 'Liquidez del Mes';
  const value = hasRealAssets ? totalBalance : monthlyNetFlow;
  const isNegative = value < 0;
  // El rojo de alarma solo se justifica cuando hay activos reales de por
  // medio (deuda real contra patrimonio real). Sin eso, un numero negativo
  // es apenas "gastaste mas de lo que registraste como ingreso este mes" --
  // informativo, no una alarma.
  const amountColorClass = hasRealAssets && isNegative ? 'text-red-400' : 'text-stone-50';

  return (
    <section className="rounded-xl border border-white/10 bg-elevated p-6 transition-colors hover:border-gold/15">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <p className="text-[11px] font-medium uppercase tracking-[0.2em] text-stone-500">Trayectoria y Control</p>
          <h2 className="mt-1 text-base font-semibold text-gold">{label}</h2>
          <p className={cn('amount mt-2 text-4xl font-bold', amountColorClass)}>{formatMoney(value, baseCurrency)}</p>
          {!hasRealAssets && (
            <p className="mt-2 max-w-sm text-xs text-stone-500">
              Aun no registras un saldo inicial en tus cuentas. Este numero es lo que ha entrado y salido este mes, no tu
              patrimonio total.
            </p>
          )}
        </div>
        <span className="inline-flex items-center gap-1.5 rounded-full border border-growth/40 bg-growth/10 px-3 py-1 text-xs font-medium text-growth">
          <span className="h-1.5 w-1.5 rounded-full bg-growth" />
          Calculo deterministico · cero estimaciones por IA
        </span>
      </div>
    </section>
  );
}
