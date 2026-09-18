'use client';

import { useState } from 'react';
import { PrivacyCenterPanel } from '@/components/dashboard/PrivacyCenterPanel';
import { Modal } from '@/components/ui/Modal';

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

      <Modal open={open} onClose={() => setOpen(false)} className="max-w-md p-6" labelledBy="privacy-modal-title">
            <h2 id="privacy-modal-title" className="text-base font-medium text-stone-100">Centro de Privacidad</h2>
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
      </Modal>
    </>
  );
}
