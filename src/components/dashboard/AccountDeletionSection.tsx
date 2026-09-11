'use client';

import { useState } from 'react';
import { deleteMyAccount, getAccountDeletionPreview, type AccountDeletionBlocker } from '@/actions/account';
import { getSupabaseBrowserClient } from '@/infrastructure/supabase/client';
import { cn } from '@/lib/utils';

type Step = 'closed' | 'loading-preview' | 'blocked' | 'confirm-text' | 'confirm-final' | 'deleting' | 'done';

/** Misma navegacion "dura" que usa app/page.tsx tras un cambio de sesion -- garantiza que la cookie ya invalida no genere una carrera con el servidor. */
function hardNavigate(path: string) {
  window.location.assign(path);
}

/**
 * Privacidad y Seguridad -> Eliminar Cuenta y Datos: flujo de doble
 * confirmacion explicito (Habeas Data, Ley 1581 de 2012 -- la persona tiene
 * derecho a pedir la supresion de sus datos en cualquier momento). Paso 1:
 * escribir "ELIMINAR" a mano (nunca un solo click accidental para algo
 * irreversible). Paso 2: boton final rojo, sin vuelta atras. Si la persona
 * sigue siendo dueña de un espacio compartido, el flujo se detiene ahi
 * mismo -- nunca se borra en silencio el trabajo de alguien mas.
 */
export function AccountDeletionSection() {
  const [step, setStep] = useState<Step>('closed');
  const [blockers, setBlockers] = useState<AccountDeletionBlocker[]>([]);
  const [soloOwnedSpaceCount, setSoloOwnedSpaceCount] = useState(0);
  const [confirmationText, setConfirmationText] = useState('');
  const [error, setError] = useState<string | null>(null);

  function close() {
    setStep('closed');
    setConfirmationText('');
    setError(null);
  }

  async function handleOpen() {
    setStep('loading-preview');
    setError(null);
    const preview = await getAccountDeletionPreview();
    if ('error' in preview) {
      setError(preview.error);
      setStep('closed');
      return;
    }
    setBlockers(preview.blockers);
    setSoloOwnedSpaceCount(preview.soloOwnedSpaceCount);
    setStep(preview.blockers.length > 0 ? 'blocked' : 'confirm-text');
  }

  function handleContinue() {
    if (confirmationText.trim().toUpperCase() !== 'ELIMINAR') {
      setError('Escribe ELIMINAR, tal cual, para continuar.');
      return;
    }
    setError(null);
    setStep('confirm-final');
  }

  async function handleFinalDelete() {
    setStep('deleting');
    setError(null);
    const result = await deleteMyAccount(confirmationText);
    if (!result.success) {
      setError(result.error);
      setStep('confirm-final');
      return;
    }
    setStep('done');
    const supabase = getSupabaseBrowserClient();
    await supabase.auth.signOut();
    setTimeout(() => hardNavigate('/login'), 2000);
  }

  const isOpen = step !== 'closed';

  return (
    <>
      <button
        type="button"
        onClick={handleOpen}
        className="rounded-lg border border-red-500/30 px-3 py-2 text-sm text-red-400 transition hover:border-red-500/50 hover:bg-red-950/20"
      >
        Eliminar cuenta y datos
      </button>

      {isOpen && (
        <div role="dialog" aria-modal="true" className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <div className="w-full max-w-md rounded-2xl border border-white/10 bg-elevated p-6 text-stone-100 shadow-2xl shadow-black/50">
            {step === 'loading-preview' && <p className="py-6 text-center text-sm text-stone-400">Verificando tus espacios...</p>}

            {step === 'blocked' && (
              <>
                <h2 className="text-base font-medium text-stone-100">No puedes eliminar tu cuenta todavia</h2>
                <p className="mt-2 text-sm text-stone-300">
                  Sigues siendo dueña/o de {blockers.length === 1 ? 'un espacio compartido' : 'espacios compartidos'} con otras
                  personas. Transfiere la propiedad a otro miembro o elimina a los demas integrantes antes de continuar.
                </p>
                <ul className="mt-3 flex flex-col gap-1.5">
                  {blockers.map((b) => (
                    <li key={b.spaceId} className="rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-stone-200">
                      {b.spaceName} <span className="text-stone-500">· {b.memberCount} miembros</span>
                    </li>
                  ))}
                </ul>
                <div className="mt-5 flex justify-end">
                  <button type="button" onClick={close} className="rounded-lg bg-white/10 px-4 py-2 text-sm text-stone-200 hover:bg-white/15">
                    Entendido
                  </button>
                </div>
              </>
            )}

            {step === 'confirm-text' && (
              <>
                <h2 className="text-base font-medium text-stone-100">Eliminar cuenta y datos</h2>
                <p className="mt-2 text-sm text-stone-300">
                  Esto borra tu perfil, tu sesion, y{' '}
                  {soloOwnedSpaceCount > 0
                    ? `${soloOwnedSpaceCount === 1 ? 'el espacio' : 'los ' + soloOwnedSpaceCount + ' espacios'} de los que eres unica/o integrante (cuentas, movimientos, facturas, todo)`
                    : 'los espacios de los que eres unica/o integrante'}
                  . Es permanente: no hay forma de recuperarlo despues.
                </p>
                <label className="mt-4 block text-xs font-medium text-stone-300">
                  Escribe <span className="font-semibold text-stone-100">ELIMINAR</span> para continuar
                </label>
                <input
                  type="text"
                  value={confirmationText}
                  onChange={(e) => setConfirmationText(e.target.value)}
                  className="mt-1.5 w-full rounded-lg border border-white/10 bg-obsidian px-3 py-2 text-sm text-stone-100 focus:border-red-500 focus:outline-none focus:ring-1 focus:ring-red-500"
                  autoFocus
                />
                {error && <p className="mt-2 text-xs text-red-400">{error}</p>}
                <div className="mt-5 flex justify-end gap-2">
                  <button type="button" onClick={close} className="rounded-lg px-4 py-2 text-sm text-stone-400 hover:text-stone-200">
                    Cancelar
                  </button>
                  <button
                    type="button"
                    onClick={handleContinue}
                    disabled={confirmationText.trim().toUpperCase() !== 'ELIMINAR'}
                    className="rounded-lg bg-red-600/90 px-4 py-2 text-sm font-medium text-white transition hover:bg-red-600 disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    Continuar
                  </button>
                </div>
              </>
            )}

            {(step === 'confirm-final' || step === 'deleting') && (
              <>
                <h2 className="text-base font-medium text-red-400">¿Estas completamente segura/o?</h2>
                <p className="mt-2 text-sm text-stone-300">
                  Esta es la ultima confirmacion. Al continuar, tu cuenta y tus datos se eliminan de inmediato y de forma
                  permanente.
                </p>
                {error && <p className="mt-2 text-xs text-red-400">{error}</p>}
                <div className="mt-5 flex justify-end gap-2">
                  <button
                    type="button"
                    onClick={close}
                    disabled={step === 'deleting'}
                    className="rounded-lg px-4 py-2 text-sm text-stone-400 hover:text-stone-200 disabled:opacity-40"
                  >
                    Cancelar
                  </button>
                  <button
                    type="button"
                    onClick={handleFinalDelete}
                    disabled={step === 'deleting'}
                    className={cn(
                      'rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-red-500',
                      step === 'deleting' && 'cursor-not-allowed opacity-60',
                    )}
                  >
                    {step === 'deleting' ? 'Eliminando...' : 'Si, eliminar mi cuenta permanentemente'}
                  </button>
                </div>
              </>
            )}

            {step === 'done' && (
              <p className="py-6 text-center text-sm text-stone-300">Tu cuenta y tus datos fueron eliminados. Hasta pronto.</p>
            )}
          </div>
        </div>
      )}
    </>
  );
}
