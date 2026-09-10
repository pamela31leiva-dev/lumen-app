'use client';

import { useState } from 'react';
import { getSupabaseBrowserClient } from '@/infrastructure/supabase/client';
import { cn } from '@/lib/utils';

/**
 * Requiere que el proveedor Google este habilitado en el dashboard de
 * Supabase (Authentication > Providers) con credenciales de Google Cloud —
 * configuracion externa que el usuario debe hacer una sola vez; el codigo
 * ya esta listo para cuando eso este activo.
 *
 * El destino del redirect usa NEXT_PUBLIC_SITE_URL cuando esta configurada
 * (produccion) en vez de depender solo de window.location.origin, para que
 * el valor sea explicito y no dependa de deteccion en tiempo de ejecucion.
 * Si Supabase igual redirige a localhost en produccion, el problema esta en
 * Authentication > URL Configuration > Site URL / Redirect URLs del panel
 * de Supabase, no en este codigo: ese panel valida el redirectTo contra una
 * lista blanca y cae de vuelta a su "Site URL" si la URL no esta permitida.
 */
export function GoogleSignInButton() {
  const [isRedirecting, setIsRedirecting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleClick() {
    setError(null);
    setIsRedirecting(true);
    const supabase = getSupabaseBrowserClient();
    const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || window.location.origin;
    const { error: oauthError } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: `${siteUrl}/auth/callback` },
    });
    if (oauthError) {
      setIsRedirecting(false);
      setError('No se pudo iniciar con Google. Intenta de nuevo.');
    }
    // Si no hay error, el navegador ya esta siendo redirigido a Google.
  }

  return (
    <div>
      <button
        type="button"
        onClick={handleClick}
        disabled={isRedirecting}
        className={cn(
          'flex w-full items-center justify-center gap-2 rounded-lg border border-white/15 bg-white px-4 py-2 text-sm font-medium text-obsidian transition hover:bg-white/90 disabled:opacity-60',
        )}
      >
        <svg viewBox="0 0 24 24" className="h-4 w-4" aria-hidden="true">
          <path
            fill="#4285F4"
            d="M23.52 12.27c0-.85-.08-1.67-.22-2.45H12v4.63h6.47c-.28 1.5-1.13 2.77-2.4 3.62v3h3.88c2.27-2.09 3.57-5.17 3.57-8.8Z"
          />
          <path
            fill="#34A853"
            d="M12 24c3.24 0 5.96-1.07 7.95-2.93l-3.88-3c-1.08.72-2.45 1.15-4.07 1.15-3.13 0-5.78-2.11-6.73-4.96H1.27v3.11C3.25 21.3 7.31 24 12 24Z"
          />
          <path
            fill="#FBBC05"
            d="M5.27 14.26A7.2 7.2 0 0 1 4.9 12c0-.78.14-1.55.37-2.26V6.63H1.27A11.98 11.98 0 0 0 0 12c0 1.93.46 3.76 1.27 5.37l4-3.11Z"
          />
          <path
            fill="#EA4335"
            d="M12 4.77c1.77 0 3.35.61 4.6 1.8l3.44-3.44C17.95 1.19 15.24 0 12 0 7.31 0 3.25 2.7 1.27 6.63l4 3.11C6.22 6.88 8.87 4.77 12 4.77Z"
          />
        </svg>
        {isRedirecting ? 'Redirigiendo...' : 'Continuar con Google'}
      </button>
      {error && <p className="mt-2 text-xs text-red-400">{error}</p>}
    </div>
  );
}
