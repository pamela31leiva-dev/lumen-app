'use client';

import { useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { upgradeAnonymousAccount } from '@/actions/consent';

/**
 * Cierre del circuito de Friccion Cero: la persona ya probo Lumen en Modo
 * Fantasma (ver app/page.tsx) sin ver un formulario, y ahora que ya
 * comprobo la utilidad se le invita -- nunca se le exige -- a guardar su
 * espacio con un correo/contrasena. Convertir la cuenta anonima conserva el
 * mismo auth.uid(), asi que todo lo que ya registro sigue intacto.
 */
export function SaveSpaceBanner() {
  const router = useRouter();
  const [expanded, setExpanded] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [acceptedTerms, setAcceptedTerms] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);

    if (password.length < 8) {
      setError('La contrasena debe tener al menos 8 caracteres.');
      return;
    }
    if (!acceptedTerms) {
      setError('Acepta el tratamiento de tus datos para guardar tu espacio.');
      return;
    }

    setIsSaving(true);
    const result = await upgradeAnonymousAccount(email, password, acceptedTerms);
    setIsSaving(false);

    if (!result.success) {
      setError(result.error);
      return;
    }
    setSaved(true);
    router.refresh();
  }

  if (saved) {
    return (
      <div className="animate-fade-scale-in rounded-xl border border-growth/25 bg-growth/5 p-4 text-sm text-stone-100">
        Espacio guardado. Ya es tuyo para siempre.
      </div>
    );
  }

  if (!expanded) {
    return (
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-gold/25 bg-gold-soft p-4">
        <p className="text-sm text-stone-100">Estas probando Lumen sin cuenta. Guarda tu espacio para no perderlo.</p>
        <button
          type="button"
          onClick={() => setExpanded(true)}
          className="shrink-0 rounded-lg bg-gold px-3 py-1.5 text-xs font-medium text-obsidian transition hover:bg-gold/90"
        >
          Guardar espacio
        </button>
      </div>
    );
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="animate-fade-scale-in flex flex-col gap-3 rounded-xl border border-gold/25 bg-gold-soft p-4"
    >
      <div className="flex items-center justify-between">
        <p className="text-sm font-medium text-stone-100">Guarda tu espacio</p>
        <button type="button" onClick={() => setExpanded(false)} className="text-xs text-stone-400 hover:text-stone-200">
          Ahora no
        </button>
      </div>

      <div className="flex flex-col gap-2 sm:flex-row">
        <input
          type="email"
          required
          autoComplete="email"
          placeholder="Correo"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="min-w-0 flex-1 rounded-lg border border-white/10 bg-obsidian px-3 py-2 text-sm text-stone-100 placeholder:text-stone-600 focus:border-emerald-600 focus:outline-none focus:ring-1 focus:ring-emerald-600"
        />
        <input
          type="password"
          required
          autoComplete="new-password"
          placeholder="Contrasena"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className="min-w-0 flex-1 rounded-lg border border-white/10 bg-obsidian px-3 py-2 text-sm text-stone-100 placeholder:text-stone-600 focus:border-emerald-600 focus:outline-none focus:ring-1 focus:ring-emerald-600"
        />
      </div>

      <label className="flex items-start gap-2 text-xs text-stone-400">
        <input
          type="checkbox"
          checked={acceptedTerms}
          onChange={(e) => setAcceptedTerms(e.target.checked)}
          className="mt-0.5 h-3.5 w-3.5 rounded border-white/20 bg-obsidian accent-emerald-600 text-emerald-600 focus:ring-emerald-600"
        />
        <span>Confirmo que soy mayor de 18 anos y acepto el tratamiento de mis datos (Ley 1581 de 2012, Habeas Data).</span>
      </label>

      {error && <p className="text-xs text-red-400">{error}</p>}

      <button
        type="submit"
        disabled={isSaving}
        className="self-start rounded-lg bg-wealth px-4 py-2 text-sm font-medium text-white transition hover:bg-wealth-hover disabled:opacity-60"
      >
        {isSaving ? 'Guardando...' : 'Guardar espacio'}
      </button>
    </form>
  );
}
