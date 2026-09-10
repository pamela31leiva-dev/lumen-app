/**
 * Esqueleto automatico de Next.js (App Router): se muestra mientras
 * ExecutiveBoardPage (Server Component) resuelve sus queries -- en
 * navegacion inicial y en cada router.refresh(). Sin esto, un fetch lento
 * se sentia como pantalla muerta; con esto, algo se mueve de inmediato.
 */
export default function ExecutiveBoardLoading() {
  return (
    <main className="min-h-screen bg-obsidian text-stone-100">
      <div className="animate-pulse border-b border-white/10 px-4 py-4 sm:px-6">
        <div className="mx-auto flex max-w-5xl items-center justify-between gap-3">
          <div className="h-4 w-40 rounded bg-white/5" />
          <div className="h-9 w-40 rounded-lg bg-white/5" />
        </div>
      </div>

      <div className="mx-auto flex max-w-5xl animate-pulse flex-col gap-6 px-6 py-8">
        <div className="h-14 rounded-xl bg-white/5" />
        <div className="h-32 rounded-xl bg-white/5" />
        <div className="h-24 rounded-xl bg-white/5" />
        <div className="h-16 rounded-xl bg-white/5" />
      </div>
    </main>
  );
}
