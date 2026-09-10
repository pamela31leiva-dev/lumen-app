'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { acceptTermsAndPrivacy } from '@/actions/consent';

/**
 * Tarjeta de aceptacion obligatoria de Terminos y Politica de Tratamiento de
 * Datos (Ley 1581 de 2012, Habeas Data). Vive en su propia pagina
 * (/accept-terms) en vez de un overlay sobre el tablero: mas simple, y evita
 * renderizar datos privados detras de un modal antes de tener consentimiento.
 */
export function AcceptTermsGate() {
  const router = useRouter();
  const [checked, setChecked] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleAccept() {
    if (!checked) {
      setError('Marca la casilla para continuar.');
      return;
    }
    setError(null);
    setIsSubmitting(true);
    const result = await acceptTermsAndPrivacy();
    setIsSubmitting(false);
    if (!result.success) {
      setError(result.error);
      return;
    }
    router.push('/executive-board');
    router.refresh();
  }

  return (
    <div className="w-full max-w-md rounded-xl border border-white/10 bg-elevated p-6">
      <h1 className="text-lg font-medium">Antes de continuar</h1>
      <p className="mt-1 text-xs text-stone-500">
        Necesitamos tu aceptacion explicita de nuestros terminos y del tratamiento de tus datos, conforme a la Ley
        1581 de 2012 (Habeas Data).
      </p>

      <div className="mt-4 max-h-56 overflow-y-auto rounded-lg border border-white/10 bg-obsidian p-4 text-xs text-stone-400">
        <p className="font-medium text-stone-300">Resumen de Terminos de Uso</p>
        <p className="mt-1.5">
          Lumen es una herramienta de organizacion financiera personal, de caracter informativo y descriptivo. No
          constituye asesoria financiera, contable, tributaria ni de inversion, y ninguna cifra o sugerencia generada
          por su motor de inteligencia artificial es vinculante: siempre depende de tu confirmacion. Eres responsable
          de las decisiones que tomes con base en la informacion que registras y consultas en la app.
        </p>

        <p className="mt-3 font-medium text-stone-300">Resumen de Tratamiento de Datos (Habeas Data)</p>
        <p className="mt-1.5">
          Guardamos tus datos de cuenta y los movimientos que registras para mostrarte tu propio patrimonio. El
          texto, voz o imagenes que capturas se envian a proveedores de inteligencia artificial externos unicamente
          para interpretarlos. Tienes derecho a acceder, actualizar, rectificar o pedir la supresion de tus datos, y
          a revocar este consentimiento, en cualquier momento.
        </p>

        <p className="mt-3">
          Puedes leer el texto completo en nuestro{' '}
          <Link href="/privacy" target="_blank" className="text-gold underline decoration-gold/40 underline-offset-2 hover:text-gold/80">
            Centro de Privacidad &amp; Habeas Data
          </Link>
          .
        </p>
      </div>

      <label className="mt-4 flex items-start gap-2 text-xs text-stone-400">
        <input
          type="checkbox"
          checked={checked}
          onChange={(e) => setChecked(e.target.checked)}
          className="mt-0.5 h-3.5 w-3.5 rounded border-white/20 bg-obsidian accent-emerald-600 text-emerald-600 focus:ring-emerald-600"
        />
        <span>He leido y acepto los Terminos de Uso y la Politica de Tratamiento de Datos de Lumen.</span>
      </label>

      {error && <p className="mt-3 text-xs text-red-400">{error}</p>}

      <button
        type="button"
        onClick={handleAccept}
        disabled={isSubmitting}
        className="mt-4 w-full rounded-lg bg-wealth px-4 py-2.5 text-sm font-medium text-white transition hover:bg-wealth-hover disabled:opacity-60"
      >
        {isSubmitting ? 'Guardando...' : 'Aceptar y continuar'}
      </button>
    </div>
  );
}
