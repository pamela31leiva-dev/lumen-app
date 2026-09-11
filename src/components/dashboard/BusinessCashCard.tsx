import type { BusinessCashInsight } from '@/domain/types/analytics';
import { cn, formatMoney } from '@/lib/utils';

interface BusinessCashCardProps {
  insight: BusinessCashInsight;
  baseCurrency: string;
}

/**
 * "Picos de Venta y Salud de Caja" -- Inteligencia para Microemprendimientos.
 * Solo se renderiza (ver executive-board/page.tsx) cuando el espacio ya
 * tiene suficiente historial de movimientos marcados como Negocio; para
 * cualquier espacio puramente personal esta seccion no existe, ni siquiera
 * vacia -- Cero Ruido. Texto plano, sin graficos ni barras: verdades
 * operativas directas, nunca una alarma (ambar en vez de rojo si la
 * liquidez operativa del mes va en contra, igual que el resto de la app).
 */
export function BusinessCashCard({ insight, baseCurrency }: BusinessCashCardProps) {
  const isNegative = insight.operatingNetFlow < 0;

  return (
    <section className="rounded-xl border border-white/10 bg-elevated p-5 transition-colors hover:border-gold/15">
      <p className="text-[11px] font-medium uppercase tracking-[0.2em] text-stone-500">Inteligencia de Negocio</p>
      <div className="mt-2 flex flex-col gap-1.5">
        {insight.peakDaysLabel && (
          <p className="text-sm text-stone-200">
            Tus <span className="font-medium text-gold">{insight.peakDaysLabel}</span> concentran el mayor volumen de
            ingresos.
          </p>
        )}
        <p className="text-sm text-stone-200">
          Liquidez operativa este mes:{' '}
          <span className={cn('amount font-medium', isNegative ? 'text-amber-300' : 'text-stone-100')}>
            {formatMoney(insight.operatingNetFlow, baseCurrency)}
          </span>
        </p>
      </div>
    </section>
  );
}
