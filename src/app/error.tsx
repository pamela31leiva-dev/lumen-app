'use client';

import { useEffect } from 'react';
import { reportClientError } from '@/actions/telemetry';

/**
 * Limite de error de Next.js para cualquier segmento de /app. Reporta el
 * fallo automaticamente (queda en logs siempre; por correo si hay un
 * proveedor configurado — ver src/lib/telemetry/reporter.ts) y muestra un
 * mensaje calmado, sin jerga tecnica ni tono alarmante.
 */
export default function ErrorBoundary({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    reportClientError({
      message: error.message,
      stack: error.stack,
      digest: error.digest,
      url: typeof window !== 'undefined' ? window.location.href : undefined,
    }).catch(() => {
      // Si ni el reporte funciona, no hay mucho mas que hacer aqui — no bloquea la UI.
    });
  }, [error]);

  return (
    <main className="flex min-h-screen items-center justify-center bg-obsidian px-4 text-stone-100">
      <div className="w-full max-w-sm rounded-xl border border-white/10 bg-elevated p-6 text-center">
        <h1 className="text-lg font-medium text-gold">Algo no salio como esperabamos</h1>
        <p className="mt-2 text-sm text-stone-400">
          Ya nos enteramos y lo estamos revisando. Tu informacion esta a salvo — intenta de nuevo en un momento.
        </p>
        <button
          type="button"
          onClick={reset}
          className="mt-5 rounded-lg bg-wealth px-4 py-2 text-sm font-medium text-white transition hover:bg-wealth-hover"
        >
          Intentar de nuevo
        </button>
      </div>
    </main>
  );
}
