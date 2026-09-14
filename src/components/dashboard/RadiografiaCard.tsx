import type { FolderDistributionSlice, WeekdayHeatPoint } from '@/domain/types/analytics';
import { FOLDER_LABEL } from '@/domain/folders';
import { cn, formatMoney } from '@/lib/utils';

interface RadiografiaCardProps {
  folderDistribution: FolderDistributionSlice[];
  weekdayHeat: WeekdayHeatPoint[];
  baseCurrency: string;
}

// Tonos oro/ambar sobre fondo oscuro, del mas brillante al mas apagado --
// como folder_distribution ya llega ordenado de mayor a menor gasto (ver
// get_executive_board_snapshot), el segmento mas grande SIEMPRE es el mas
// brillante, sin importar que carpeta sea: el brillo mismo es la señal de
// "aqui se fue mas plata", legible en el mismo vistazo de 3 segundos.
const SEGMENT_COLORS = ['bg-gold', 'bg-amber-500', 'bg-amber-700/80', 'bg-amber-900/70'];

const WEEKDAY_LABEL = ['Dom', 'Lun', 'Mar', 'Mie', 'Jue', 'Vie', 'Sab'];

function buildNarrative(slices: FolderDistributionSlice[]): string | null {
  if (slices.length === 0) return null;
  const total = slices.reduce((sum, s) => sum + s.total, 0);
  if (total <= 0) return null;
  const top = slices[0];
  const pct = Math.round((top.total / total) * 100);
  if (slices.length === 1) {
    return `Todo tu gasto de este mes esta en ${FOLDER_LABEL[top.folder]}.`;
  }
  return `El ${pct}% de tu gasto este mes fue en ${FOLDER_LABEL[top.folder]}.`;
}

/**
 * Radiografia Proporcional: reemplaza la lectura fria de numeros sueltos por
 * una barra segmentada (distribucion del gasto del mes por carpeta) + un
 * mapa de calor de que dias de la semana concentran el gasto -- toda la
 * informacion que antes exigia leer una lista se entiende de un vistazo. Se
 * calcula siempre en Postgres (folder_distribution/weekday_heat, ver 0023);
 * "Cero Ruido" se respeta no mostrando la tarjeta si no hay gasto todavia
 * este mes.
 */
export function RadiografiaCard({ folderDistribution, weekdayHeat, baseCurrency }: RadiografiaCardProps) {
  const totalSpend = folderDistribution.reduce((sum, s) => sum + s.total, 0);
  if (totalSpend <= 0) return null;

  const narrative = buildNarrative(folderDistribution);
  const maxWeekdayTotal = Math.max(1, ...weekdayHeat.map((w) => w.total));
  const weekdayByIndex = new Map(weekdayHeat.map((w) => [w.weekday, w.total]));

  return (
    <section className="rounded-xl border border-white/10 bg-elevated p-5 transition-colors hover:border-gold/15">
      <p className="text-[11px] font-medium uppercase tracking-[0.2em] text-stone-500">Radiografia del Mes</p>

      {narrative && <p className="mt-2 text-sm text-stone-200">{narrative}</p>}

      {/* Barra segmentada: proporcion visual, no una lista de numeros. */}
      <div className="mt-3 flex h-3 w-full overflow-hidden rounded-full bg-white/5">
        {folderDistribution.map((slice, i) => (
          <div
            key={slice.folder}
            className={cn(SEGMENT_COLORS[i % SEGMENT_COLORS.length], i > 0 && 'border-l border-obsidian/40')}
            style={{ width: `${Math.max(2, (slice.total / totalSpend) * 100)}%` }}
            title={`${FOLDER_LABEL[slice.folder]}: ${formatMoney(slice.total, baseCurrency)}`}
          />
        ))}
      </div>

      <div className="mt-2.5 flex flex-wrap gap-x-4 gap-y-1">
        {folderDistribution.map((slice, i) => (
          <div key={slice.folder} className="flex items-center gap-1.5 text-xs text-stone-400">
            <span className={cn('h-2 w-2 shrink-0 rounded-full', SEGMENT_COLORS[i % SEGMENT_COLORS.length])} />
            <span className="text-stone-300">{FOLDER_LABEL[slice.folder]}</span>
            <span className="amount">{formatMoney(slice.total, baseCurrency)}</span>
          </div>
        ))}
      </div>

      {/* Mapa de calor: que dias de la semana concentran el gasto (ultimos 90 dias). */}
      {weekdayHeat.length > 0 && (
        <div className="mt-4 border-t border-white/10 pt-3">
          <p className="mb-1.5 text-[10px] uppercase tracking-wide text-stone-600">Cuando gastas mas</p>
          <div className="flex gap-1.5">
            {WEEKDAY_LABEL.map((label, weekday) => {
              const total = weekdayByIndex.get(weekday) ?? 0;
              const intensity = total / maxWeekdayTotal;
              return (
                <div key={weekday} className="flex flex-1 flex-col items-center gap-1">
                  <div
                    className="h-8 w-full rounded-md bg-gold"
                    style={{ opacity: total > 0 ? Math.max(0.12, intensity) : 0.06 }}
                    title={`${label}: ${formatMoney(total, baseCurrency)}`}
                  />
                  <span className="text-[9px] text-stone-600">{label}</span>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </section>
  );
}
