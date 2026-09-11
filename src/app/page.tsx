'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { getSupabaseBrowserClient } from '@/infrastructure/supabase/client';
import { AppFooter } from '@/components/AppFooter';

/**
 * Navegacion "dura" (recarga completa) en vez de router.replace(): se
 * confirmo en produccion que, justo despues de signInAnonymously(), una
 * transicion de cliente de Next.js (RSC fetch) podia llegar al servidor
 * ANTES de que la cookie de sesion recien escrita se enviara con esa
 * peticion -- el servidor entonces no veia usuario y rebotaba a /login,
 * aunque la sesion ya existia (se confirmo visitando /executive-board de
 * nuevo un instante despues, ya con la cookie presente, y cargaba bien). Una
 * navegacion de pagina completa siempre manda las cookies actuales del
 * navegador, asi que elimina la carrera de raiz.
 */
function hardNavigate(path: string) {
  window.location.assign(path);
}

/**
 * Onboarding de Friccion Cero ("Modo Fantasma"): en vez de un landing que
 * exige registrarse antes de ver nada util, se intenta un inicio de sesion
 * anonimo de Supabase (signInAnonymously) de inmediato -- el mismo trigger
 * handle_new_user() que crea el "Espacio Personal" para un registro normal
 * corre igual aqui, asi que la persona cae directo en un espacio funcional,
 * listo para su primer movimiento, sin ver un formulario.
 *
 * Requiere "Anonymous Sign-Ins" habilitado en Supabase Dashboard ->
 * Authentication -> Sign In / Providers (no activable por SQL ni por la
 * service role key) y la migracion 0013 (profiles.email nullable). Si
 * cualquiera de las dos cosas falta, signInAnonymously() devuelve error y
 * esta pantalla cae de forma segura al landing con login/registro normal --
 * nunca se queda colgada ni rompe la carga inicial.
 */
export default function HomePage() {
  const router = useRouter();
  const [status, setStatus] = useState<'entering' | 'fallback'>('entering');

  useEffect(() => {
    let cancelled = false;

    // Precarga el destino en paralelo con la autenticacion (nunca la
    // bloquea): para cuando signInAnonymously() resuelve, el JS/RSC de
    // /executive-board ya deberia estar en cache, asi que router.replace()
    // de abajo se siente instantaneo en vez de disparar una carga fresca.
    router.prefetch('/executive-board');

    async function enterGhostMode() {
      const supabase = getSupabaseBrowserClient();

      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (cancelled) return;
      if (session) {
        hardNavigate('/executive-board');
        return;
      }

      const { error } = await supabase.auth.signInAnonymously();
      if (cancelled) return;
      if (error) {
        setStatus('fallback');
        return;
      }
      hardNavigate('/executive-board');
    }

    enterGhostMode();
    return () => {
      cancelled = true;
    };
  }, [router]);

  if (status === 'entering') {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-3 bg-obsidian text-stone-100">
        <p className="text-xs uppercase tracking-[0.2em] text-stone-500">Preparando tu espacio...</p>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen flex-col bg-obsidian text-stone-100">
      <main className="flex flex-1 flex-col items-center justify-center gap-4 p-8 text-center">
        <h1 className="text-2xl font-medium text-gold">Lumen</h1>
        <p className="text-xs uppercase tracking-[0.2em] text-stone-500">Inteligencia Patrimonial</p>
        <p className="max-w-md text-sm text-stone-400">
          Convierte texto, voz, fotos y documentos en claridad sobre tu patrimonio.
        </p>
        <Link
          href="/login"
          className="rounded-full bg-wealth px-5 py-2 text-sm font-medium text-white transition hover:bg-wealth-hover"
        >
          Iniciar sesion
        </Link>
      </main>
      <AppFooter />
    </div>
  );
}
