'use client';

import { useState, type FormEvent } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { getSupabaseBrowserClient } from '@/infrastructure/supabase/client';
import { GoogleSignInButton } from '@/components/auth/GoogleSignInButton';
import { GOOGLE_AUTH_ENABLED } from '@/lib/feature-flags';
import { AppFooter } from '@/components/AppFooter';

export default function RegisterPage() {
  const router = useRouter();
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [acceptedTerms, setAcceptedTerms] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [infoMessage, setInfoMessage] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setInfoMessage(null);

    if (password.length < 8) {
      setError('La contrasena debe tener al menos 8 caracteres.');
      return;
    }
    if (password !== confirmPassword) {
      setError('Las contrasenas no coinciden.');
      return;
    }
    if (!acceptedTerms) {
      setError('Debes confirmar que eres mayor de 18 anos para continuar.');
      return;
    }

    setIsSubmitting(true);
    const supabase = getSupabaseBrowserClient();
    const { data, error: signUpError } = await supabase.auth.signUp({
      email,
      password,
      options: { data: { full_name: fullName.trim() || null } },
    });
    setIsSubmitting(false);

    if (signUpError) {
      setError(signUpError.message);
      return;
    }

    // El trigger handle_new_user (0003) crea el perfil y el "Espacio Personal"
    // automaticamente al insertarse la fila en auth.users.
    if (!data.session) {
      setInfoMessage('Te enviamos un correo de confirmacion. Revisa tu bandeja de entrada para activar tu cuenta.');
      return;
    }

    router.push('/executive-board');
    router.refresh();
  }

  return (
    <div className="flex min-h-screen flex-col bg-obsidian text-stone-100">
      <main className="flex flex-1 items-center justify-center px-4 py-8">
      <div className="w-full max-w-sm rounded-xl border border-white/10 bg-elevated p-6">
        <h1 className="text-lg font-medium">Crear cuenta</h1>
        <p className="mt-1 text-xs text-stone-500">
          Te creamos tu Espacio Personal automaticamente para que empieces a organizar tus finanzas.
        </p>

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
            <label htmlFor="fullName" className="mb-1 block text-xs font-medium text-stone-300">
              Nombre
            </label>
            <input
              id="fullName"
              type="text"
              autoComplete="name"
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              className="w-full rounded-lg border border-white/10 bg-obsidian px-3 py-2 text-sm text-stone-100 focus:border-emerald-600 focus:outline-none focus:ring-1 focus:ring-emerald-600"
            />
          </div>

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
              autoComplete="new-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full rounded-lg border border-white/10 bg-obsidian px-3 py-2 text-sm text-stone-100 focus:border-emerald-600 focus:outline-none focus:ring-1 focus:ring-emerald-600"
            />
          </div>

          <div>
            <label htmlFor="confirmPassword" className="mb-1 block text-xs font-medium text-stone-300">
              Confirmar contrasena
            </label>
            <input
              id="confirmPassword"
              type="password"
              required
              autoComplete="new-password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              className="w-full rounded-lg border border-white/10 bg-obsidian px-3 py-2 text-sm text-stone-100 focus:border-emerald-600 focus:outline-none focus:ring-1 focus:ring-emerald-600"
            />
          </div>

          <label className="flex items-start gap-2 text-xs text-stone-400">
            <input
              type="checkbox"
              checked={acceptedTerms}
              onChange={(e) => setAcceptedTerms(e.target.checked)}
              className="mt-0.5 h-3.5 w-3.5 rounded border-white/20 bg-obsidian accent-emerald-600 text-emerald-600 focus:ring-emerald-600"
            />
            <span>
              Confirmo que soy mayor de 18 anos y acepto el tratamiento de mis datos conforme a la Ley 1581 de 2012
              (Habeas Data).
            </span>
          </label>

          {error && <p className="text-xs text-red-400">{error}</p>}
          {infoMessage && <p className="text-xs text-emerald-400">{infoMessage}</p>}

          <button
            type="submit"
            disabled={isSubmitting}
            className="mt-1 rounded-lg bg-wealth px-4 py-2 text-sm font-medium text-white transition hover:bg-wealth-hover disabled:opacity-60"
          >
            {isSubmitting ? 'Creando cuenta...' : 'Crear cuenta'}
          </button>
        </form>

        <p className="mt-4 text-center text-xs text-stone-500">
          Ya tienes cuenta?{' '}
          <Link href="/login" className="text-emerald-400 hover:text-emerald-300">
            Inicia sesion
          </Link>
        </p>
      </div>
      </main>
      <AppFooter />
    </div>
  );
}
