'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { getSupabaseBrowserClient } from '@/infrastructure/supabase/client';
import { AppFooter } from '@/components/AppFooter';

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

    async function enterGhostMode() {
      const supabase = getSupabaseBrowserClient();

      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (cancelled) return;
      if (session) {
        router.replace('/executive-board');
        return;
      }

      const { error } = await supabase.auth.signInAnonymously();
      if (cancelled) return;
      if (error) {
        setStatus('fallback');
        return;
      }
      router.replace('/executive-board');
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
