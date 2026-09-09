'use client';

import { useRef, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { createSpace } from '@/actions/dashboard';
import type { SpaceType } from '@/domain/types/dashboard';
import { cn } from '@/lib/utils';

const SPACE_TYPE_LABEL: Record<SpaceType, string> = {
  personal: 'Personal',
  family: 'Familiar',
  business: 'Negocio',
  project: 'Proyecto',
};

interface CreateSpaceDialogProps {
  /** Clase del boton disparador; permite reusar este dialogo con distinto estilo (SpaceSwitcher vs /settings). */
  triggerClassName?: string;
  triggerLabel?: string;
}

/**
 * Boton + dialogo autonomos para crear un espacio nuevo. Se usa tanto desde
 * SpaceSwitcher (barra superior) como desde /settings (gestion del espacio).
 */
export function CreateSpaceDialog({
  triggerClassName,
  triggerLabel = '+ Nuevo espacio',
}: CreateSpaceDialogProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [name, setName] = useState('');
  const [type, setType] = useState<SpaceType>('personal');
  const [formError, setFormError] = useState<string | null>(null);
  const nameInputRef = useRef<HTMLInputElement>(null);

  function handleCreateSpace() {
    setFormError(null);
    const trimmed = name.trim();
    if (!trimmed) {
      setFormError('Escribe un nombre para el espacio.');
      nameInputRef.current?.focus();
      return;
    }
    startTransition(async () => {
      const result = await createSpace(trimmed, type);
      if (!result.success) {
        setFormError(result.error);
        return;
      }
      setDialogOpen(false);
      setName('');
      setType('personal');
      router.refresh();
    });
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setDialogOpen(true)}
        className={
          triggerClassName ??
          'rounded-lg border border-gold/40 bg-gold/10 px-3 py-2 text-sm font-medium text-gold transition hover:bg-gold/20'
        }
      >
        {triggerLabel}
      </button>

      {dialogOpen && (
        <div role="dialog" aria-modal="true" className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <div className="w-full max-w-sm rounded-xl border border-white/10 bg-elevated p-6 shadow-xl">
            <h2 className="text-base font-medium text-stone-100">Crear espacio</h2>
            <p className="mt-1 text-xs text-stone-400">
              Un espacio agrupa cuentas, categorias y movimientos de forma aislada (Personal, Familiar, Negocio o Proyecto).
            </p>

            <div className="mt-4 flex flex-col gap-3">
              <div>
                <label htmlFor="space-name" className="mb-1 block text-xs font-medium text-stone-300">
                  Nombre
                </label>
                <input
                  id="space-name"
                  ref={nameInputRef}
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Ej. Casa, Freelance, Viaje a Cartagena"
                  className="w-full rounded-lg border border-white/10 bg-obsidian px-3 py-2 text-sm text-stone-100 placeholder:text-stone-600 focus:border-emerald-600 focus:outline-none focus:ring-1 focus:ring-emerald-600"
                />
              </div>

              <div>
                <label htmlFor="space-type" className="mb-1 block text-xs font-medium text-stone-300">
                  Tipo
                </label>
                <select
                  id="space-type"
                  value={type}
                  onChange={(e) => setType(e.target.value as SpaceType)}
                  className="w-full rounded-lg border border-white/10 bg-obsidian px-3 py-2 text-sm text-stone-100 focus:border-emerald-600 focus:outline-none focus:ring-1 focus:ring-emerald-600"
                >
                  {Object.entries(SPACE_TYPE_LABEL).map(([value, label]) => (
                    <option key={value} value={value}>
                      {label}
                    </option>
                  ))}
                </select>
              </div>

              {formError && <p className="text-xs text-red-400">{formError}</p>}
            </div>

            <div className="mt-5 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => {
                  setDialogOpen(false);
                  setFormError(null);
                }}
                className="rounded-lg px-3 py-2 text-sm text-stone-400 hover:text-stone-200"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={handleCreateSpace}
                disabled={isPending}
                className={cn(
                  'rounded-lg bg-wealth px-4 py-2 text-sm font-medium text-white transition hover:bg-wealth-hover',
                  isPending && 'opacity-60',
                )}
              >
                {isPending ? 'Creando...' : 'Crear espacio'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
