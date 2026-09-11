import type { IdentitySnapshot } from '@/domain/types/dashboard';

/**
 * "Asi te conozco" -- refuerzo emocional del Clarity Loop: le muestra a la
 * persona lo que Lumen ya aprendio de su espacio, en tono calido, nunca
 * analitico ni clinico. Todo el contenido viene de datos reales
 * (getIdentitySnapshot); si no hay suficiente historial, el mensaje lo dice
 * con la misma calidez en vez de forzar una lectura vacia.
 */
export function IdentitySnapshotCard({ snapshot }: { snapshot: IdentitySnapshot }) {
  const hasContent = snapshot.learnedHints.length > 0 || snapshot.topCategoryName !== null;

  return (
    <div className="mx-auto w-full max-w-md rounded-2xl border border-gold/20 bg-gradient-to-b from-elevated to-obsidian p-6 text-stone-100 shadow-2xl shadow-black/50">
      <p className="text-[11px] uppercase tracking-[0.2em] text-gold">Lumen · Asi te conozco</p>

      {!hasContent && (
        <p className="mt-4 text-sm text-stone-300">
          Todavia estoy conociendo este espacio. Mientras mas registres, mas nitido se vuelve el mapa.
        </p>
      )}

      {snapshot.topCategoryName && (
        <p className="mt-4 text-sm text-stone-200">
          La mayor parte de tu gasto (
          <span className="amount font-medium text-gold">{snapshot.topCategoryShare}%</span>) va a{' '}
          <span className="font-medium text-stone-100">{snapshot.topCategoryName}</span>. Ya lo tengo mapeado.
        </p>
      )}

      {snapshot.learnedHints.length > 0 && (
        <div className="mt-4 flex flex-col gap-2.5 border-t border-white/10 pt-4">
          {snapshot.learnedHints.map((hint, i) => (
            <p key={i} className="text-sm text-stone-300">
              Cuando algo se parece a <span className="italic text-stone-200">&ldquo;{hint.question}&rdquo;</span>, ya se
              que quieres decir <span className="font-medium text-stone-100">&ldquo;{hint.answer}&rdquo;</span>.
            </p>
          ))}
        </div>
      )}
    </div>
  );
}
