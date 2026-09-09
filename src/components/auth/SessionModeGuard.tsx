'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { getSupabaseBrowserClient } from '@/infrastructure/supabase/client';
import { shouldTerminateEphemeralSession } from '@/lib/session-preference';

/**
 * Montado una vez en el layout raiz. Si el usuario eligio "cerrar sesion al
 * salir" en un login anterior y el navegador se cerro desde entonces, cierra
 * la sesion real (revoca el token) en vez de solo dejar que la cookie siga
 * viva — porque la cookie de @supabase/ssr no expira sola al cerrar el
 * navegador (ver src/lib/session-preference.ts).
 */
export function SessionModeGuard() {
  const router = useRouter();

  useEffect(() => {
    if (!shouldTerminateEphemeralSession()) return;

    const supabase = getSupabaseBrowserClient();
    supabase.auth.signOut().finally(() => {
      router.replace('/login');
    });
  }, [router]);

  return null;
}
