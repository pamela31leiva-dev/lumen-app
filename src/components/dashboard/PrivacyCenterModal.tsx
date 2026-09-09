'use client';

import { useState } from 'react';
import { PrivacyCenterPanel } from '@/components/dashboard/PrivacyCenterPanel';

/** Acceso rapido desde cualquier pantalla (ver AppNav). La vista formal y completa vive en /privacy. */
export function PrivacyCenterModal() {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="rounded-lg border border-white/10 px-3 py-2 text-sm text-stone-300 transition hover:border-white/20 hover:text-stone-100"
      >
        Centro de Privacidad
      </button>

      {open && (
        <div role="dialog" aria-modal="true" className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <div className="w-full max-w-md rounded-xl border border-white/10 bg-elevated p-6 shadow-xl">
            <h2 className="text-base font-medium text-stone-100">Centro de Privacidad</h2>
            <p className="mt-1 text-xs text-stone-400">
              Habeas Data (Ley 1581 de 2012): puedes descargar todo lo que guardamos sobre ti, o pedir que lo
              eliminemos.
            </p>

            <div className="mt-5">
              <PrivacyCenterPanel />
            </div>

            <div className="mt-5 flex justify-end">
              <button type="button" onClick={() => setOpen(false)} className="text-sm text-stone-400 hover:text-stone-200">
                Cerrar
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
