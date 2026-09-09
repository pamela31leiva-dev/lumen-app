'use client';

import { useState, type FormEvent } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { getSupabaseBrowserClient } from '@/infrastructure/supabase/client';
import { persistSessionMode, readStoredSessionMode, type SessionMode } from '@/lib/session-preference';
import { GoogleSignInButton } from '@/components/auth/GoogleSignInButton';
import { GOOGLE_AUTH_ENABLED } from '@/lib/feature-flags';
import { AppFooter } from '@/components/AppFooter';

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [keepSignedIn, setKeepSignedIn] = useState<boolean>(() => readStoredSessionMode() !== 'ephemeral');
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setIsSubmitting(true);

    const supabase = getSupabaseBrowserClient();
    const { error: signInError } = await supabase.auth.signInWithPassword({ email, password });

    setIsSubmitting(false);

    if (signInError) {
      setError('Correo o contrasena incorrectos.');
      return;
    }

    const mode: SessionMode = keepSignedIn ? 'persistent' : 'ephemeral';
    persistSessionMode(mode);
    router.push('/executive-board');
    router.refresh();
  }

  return (
    <div className="flex min-h-screen flex-col bg-obsidian text-stone-100">
      <main className="flex flex-1 items-center justify-center px-4 py-8">
      <div className="w-full max-w-sm rounded-xl border border-white/10 bg-elevated p-6">
        <h1 className="text-lg font-medium">Iniciar sesion</h1>
        <p className="mt-1 text-xs text-stone-500">Entra a tu espacio en Lumen.</p>

        {GOOGLE_AUTH_ENABLED && (
          <>
            <div className="mt-5">
              <GoogleSignInButton />
            </div>
            <div className="my-4 flex items-center gap-3 text-[11px] text-stone-600">
              <div className="h-px flex-1 bg-white/10" />
              o con tu correo
              <div className="h-px flex-1 bg-white/10" />
            </div>
          </>
        )}

        <form onSubmit={handleSubmit} className={GOOGLE_AUTH_ENABLED ? 'flex flex-col gap-3' : 'mt-5 flex flex-col gap-3'}>
          <div>
            <label htmlFor="email" className="mb-1 block text-xs font-medium text-stone-300">
              Correo
            </label>
            <input
              id="email"
              type="email"
              required
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full rounded-lg border border-white/10 bg-obsidian px-3 py-2 text-sm text-stone-100 focus:border-emerald-600 focus:outline-none focus:ring-1 focus:ring-emerald-600"
            />
          </div>

          <div>
            <label htmlFor="password" className="mb-1 block text-xs font-medium text-stone-300">
              Contrasena
            </label>
            <input
              id="password"
              type="password"
              required
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full rounded-lg border border-white/10 bg-obsidian px-3 py-2 text-sm text-stone-100 focus:border-emerald-600 focus:outline-none focus:ring-1 focus:ring-emerald-600"
            />
          </div>

          <label className="flex items-center gap-2 text-xs text-stone-400">
            <input
              type="checkbox"
              checked={keepSignedIn}
              onChange={(e) => setKeepSignedIn(e.target.checked)}
              className="h-3.5 w-3.5 rounded border-white/20 bg-obsidian accent-emerald-600"
            />
            Mantener sesion iniciada en este dispositivo
          </label>

          {error && <p className="text-xs text-red-400">{error}</p>}

          <button
            type="submit"
            disabled={isSubmitting}
            className="mt-1 rounded-lg bg-wealth px-4 py-2 text-sm font-medium text-white transition hover:bg-wealth-hover disabled:opacity-60"
          >
            {isSubmitting ? 'Entrando...' : 'Entrar'}
          </button>
        </form>

        <p className="mt-4 text-center text-xs text-stone-500">
          No tienes cuenta?{' '}
          <Link href="/register" className="text-emerald-400 hover:text-emerald-300">
            Crea una
          </Link>
        </p>
      </div>
      </main>
      <AppFooter />
    </div>
  );
}
