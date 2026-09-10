'use client';

import { useState } from 'react';
import { getImpactSummary } from '@/actions/dashboard';
import { ImpactSummaryCard } from '@/components/dashboard/ImpactSummaryCard';
import type { ImpactSummary } from '@/domain/types/dashboard';

/**
 * Punto de entrada del Resumen de Impacto ("Tu año en numeros") — vive en
 * /settings (Cero Ruido: es para presumir/repasar, no una decision del dia).
 * La tarjeta (ImpactSummaryCard) esta pensada para captura de pantalla;
 * exportar/compartir como imagen nativa queda para una siguiente iteracion.
 */
export function ImpactSummaryModal({ spaceId }: { spaceId: string }) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [summary, setSummary] = useState<ImpactSummary | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function handleOpen() {
    setOpen(true);
    if (summary) return;
    setLoading(true);
    setError(null);
    const result = await getImpactSummary(spaceId);
    setLoading(false);
    if (!result) {
      setError('No se pudo calcular tu resumen todavia.');
      return;
    }
    setSummary(result);
  }

  return (
    <>
      <button
        type="button"
        onClick={handleOpen}
        className="rounded-lg border border-gold/30 px-3 py-2 text-sm text-gold transition hover:border-gold/50 hover:bg-gold/10"
      >
        Tu año en números
      </button>

      {open && (
        <div role="dialog" aria-modal="true" className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <div className="max-h-[90vh] w-full max-w-md overflow-y-auto">
            {loading && <p className="py-10 text-center text-sm text-stone-400">Calculando tu resumen...</p>}
            {error && <p className="py-10 text-center text-sm text-red-400">{error}</p>}
            {summary && !loading && (
              <>
                <ImpactSummaryCard summary={summary} />
                <p className="mt-3 text-center text-xs text-stone-500">
                  Captura de pantalla para guardarlo o compartirlo — con tus movimientos reales, sin datos inventados.
                </p>
              </>
            )}
            <div className="mt-4 flex justify-center">
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="rounded-lg px-4 py-2 text-sm text-stone-400 hover:text-stone-200"
              >
                Cerrar
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
