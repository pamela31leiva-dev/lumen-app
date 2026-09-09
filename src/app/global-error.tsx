'use client';

import { useEffect } from 'react';
import { reportClientError } from '@/actions/telemetry';

/**
 * Limite de error raiz: se activa si el error ocurre en el layout raiz mismo
 * (fuera del alcance de error.tsx). Debe renderizar su propio <html>/<body>.
 */
export default function GlobalErrorBoundary({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    reportClientError({
      message: error.message,
      stack: error.stack,
      digest: error.digest,
      url: typeof window !== 'undefined' ? window.location.href : undefined,
    }).catch(() => {
      // Sin fallback adicional: no hay mas UI que pueda reaccionar a esto.
    });
  }, [error]);

  return (
    <html lang="es">
      <body style={{ background: '#0B0F17', color: '#f5f5f4', margin: 0 }}>
        <main
          style={{
            display: 'flex',
            minHeight: '100vh',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '1rem',
            fontFamily: 'system-ui, sans-serif',
          }}
        >
          <div
            style={{
              width: '100%',
              maxWidth: 384,
              borderRadius: 12,
              border: '1px solid rgba(255,255,255,0.1)',
              background: '#111827',
              padding: 24,
              textAlign: 'center',
            }}
          >
            <h1 style={{ fontSize: 18, fontWeight: 500, color: '#D4AF37', margin: 0 }}>Lumen no pudo cargar</h1>
            <p style={{ marginTop: 8, fontSize: 14, color: '#a8a29e' }}>
              Ya nos enteramos y lo estamos revisando. Intenta recargar en un momento.
            </p>
            <button
              type="button"
              onClick={reset}
              style={{
                marginTop: 20,
                borderRadius: 8,
                background: '#2F6F5E',
                color: 'white',
                padding: '8px 16px',
                fontSize: 14,
                fontWeight: 500,
                border: 'none',
                cursor: 'pointer',
              }}
            >
              Intentar de nuevo
            </button>
          </div>
        </main>
      </body>
    </html>
  );
}
