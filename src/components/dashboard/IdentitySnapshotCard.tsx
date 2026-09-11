import type { IdentitySnapshot } from '@/domain/types/dashboard';

interface IdentitySnapshotCardProps {
  snapshot: IdentitySnapshot;
  spaceName: string;
}

/**
 * "Asi te conozco" -- refuerzo emocional del Clarity Loop: le muestra a la
 * persona lo que Lumen ya aprendio de su espacio, en tono calido, nunca
 * analitico ni clinico. Todo el contenido viene de datos reales
 * (getIdentitySnapshot); si no hay suficiente historial, el mensaje lo dice
 * con la misma calidez en vez de forzar una lectura vacia.
 *
 * Mismo lenguaje visual que ImpactSummaryCard ("Tu año en numeros") -- tarjeta
 * con borde dorado, numero grande, tarjetas internas para los aprendizajes --
 * para que "radiografia financiera" se sienta con el mismo peso, en vez de
 * texto plano escondido en un modal. Vive directo en la pagina (nunca detras
 * de un overlay), asi que no compite en z-index con nada mas.
 */
export function IdentitySnapshotCard({ snapshot, spaceName }: IdentitySnapshotCardProps) {
  const hasContent = snapshot.learnedHints.length > 0 || snapshot.topCategoryName !== null;

  return (
    <div className="w-full overflow-hidden rounded-2xl border border-gold/20 bg-gradient-to-b from-elevated to-obsidian p-6 text-stone-100 shadow-2xl shadow-black/50">
      <p className="text-[11px] uppercase tracking-[0.2em] text-gold">Lumen · Asi te conozco</p>
      <p className="text-xs text-stone-500">{spaceName}</p>

      {!hasContent && (
        <p className="mt-4 text-sm text-stone-300">
          Todavia estoy conociendo este espacio. Mientras mas registres, mas nitido se vuelve el mapa.
        </p>
      )}

      {snapshot.topCategoryName && (
        <div className="mt-6">
          <p className="text-xs text-stone-500">Tu categoria mas frecuente</p>
          <p className="mt-1 text-2xl font-semibold text-stone-50">{snapshot.topCategoryName}</p>
          <div className="mt-3 flex items-center gap-3">
            <div className="h-1.5 flex-1 rounded-full bg-white/5">
              <div className="h-1.5 rounded-full bg-gold" style={{ width: `${Math.max(6, snapshot.topCategoryShare ?? 0)}%` }} />
            </div>
            <span className="amount shrink-0 text-sm font-medium text-gold">{snapshot.topCategoryShare}%</span>
          </div>
          <p className="mt-1 text-xs text-stone-500">del gasto confirmado va ahi. Ya lo tengo mapeado.</p>
        </div>
      )}

      {snapshot.learnedHints.length > 0 && (
        <div className="mt-6">
          <p className="text-xs text-stone-500">Lo que ya me respondiste</p>
          <div className="mt-2 flex flex-col gap-2">
            {snapshot.learnedHints.map((hint, i) => (
              <div key={i} className="rounded-lg border border-white/10 bg-white/5 p-3">
                <p className="text-[11px] text-stone-500">
                  Cuando algo se parece a <span className="italic text-stone-400">&ldquo;{hint.question}&rdquo;</span>
                </p>
                <p className="mt-1 text-sm font-medium text-stone-100">&ldquo;{hint.answer}&rdquo;</p>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
