'use client';

import { useEffect, useState } from 'react';
import { LumenGuideAvatar } from '@/components/guide/LumenGuideAvatar';
import type { LumenGuideMessage } from '@/domain/guide/messages';
import { cn } from '@/lib/utils';

const DISMISSED_KEY_PREFIX = 'lumen-guide-dismissed:';

/**
 * Burbuja de contexto de "Lumen Guide" (Fase 1): acompaña una pantalla
 * concreta con un mensaje ya curado (ver domain/guide/messages.ts), nunca
 * bloquea nada -- inline, descartable, y una vez que la persona la cierra no
 * vuelve a insistir (localStorage por id, por dispositivo -- igual de
 * "conveniencia liviana, no dato critico" que cualquier otro uso de
 * localStorage en la app). Cero Ruido: si ya se cerro, este componente
 * simplemente no renderiza nada, nunca un hueco vacio.
 */
export function LumenGuideTip({ id, mood, title, message, className }: LumenGuideMessage & { className?: string }) {
  const [dismissed, setDismissed] = useState(true);

  useEffect(() => {
    try {
      setDismissed(window.localStorage.getItem(DISMISSED_KEY_PREFIX + id) === 'true');
    } catch {
      // localStorage puede fallar (modo privado, permisos) -- mostrar el
      // tip de todas formas es mas seguro que esconderlo por error.
      setDismissed(false);
    }
  }, [id]);

  function handleDismiss() {
    setDismissed(true);
    try {
      window.localStorage.setItem(DISMISSED_KEY_PREFIX + id, 'true');
    } catch {
      // Sin persistencia el tip solo reaparece la proxima visita -- molesto,
      // no roto.
    }
  }

  if (dismissed) return null;

  return (
    <div
      className={cn(
        'animate-fade-scale-in flex items-start gap-3 rounded-xl border border-gold/20 bg-gold-soft px-4 py-3',
        className,
      )}
    >
      <LumenGuideAvatar mood={mood} size={36} className="mt-0.5 shrink-0" />
      <div className="min-w-0 flex-1">
        {title && <p className="text-sm font-medium text-stone-100">{title}</p>}
        <p className="mt-0.5 text-sm text-stone-300">{message}</p>
      </div>
      <button
        type="button"
        onClick={handleDismiss}
        title="Entendido, no volver a mostrar"
        aria-label="Cerrar mensaje de Lumen Guide"
        className="shrink-0 rounded-md p-1 text-stone-500 transition hover:bg-white/5 hover:text-stone-300"
      >
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75} className="h-4 w-4">
          <path strokeLinecap="round" strokeLinejoin="round" d="M6 6l12 12M18 6 6 18" />
        </svg>
      </button>
    </div>
  );
}
