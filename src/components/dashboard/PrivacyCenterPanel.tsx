'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { exportUserData, purgeUserData } from '@/actions/privacy';
import { cn } from '@/lib/utils';

const CONFIRM_PHRASE = 'ELIMINAR';

/**
 * Contenido del Centro de Privacidad (Habeas Data), sin cromo de dialogo.
 * Se usa tanto dentro de PrivacyCenterModal (acceso rapido) como directamente
 * en la pagina /privacy (vista formal de pagina completa).
 */
export function PrivacyCenterPanel() {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [purgeConfirmText, setPurgeConfirmText] = useState('');
  const [purgeSummary, setPurgeSummary] = useState<string | null>(null);

  function handleExport() {
    setError(null);
    startTransition(async () => {
      const result = await exportUserData();
      if (!result.success) {
        setError(result.error);
        return;
      }
      const blob = new Blob([JSON.stringify(result.data, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `mis-datos-${new Date().toISOString().slice(0, 10)}.json`;
      link.click();
      URL.revokeObjectURL(url);
    });
  }

  function handlePurge() {
    setError(null);
    setPurgeSummary(null);
    startTransition(async () => {
      const result = await purgeUserData();
      if (!result.success) {
        setError(result.error);
        return;
      }
      const deleted = result.steps.filter((s) => s.action === 'space_deleted').length;
      const left = result.steps.filter((s) => s.action === 'left_space').length;
      setPurgeSummary(
        `Listo: ${deleted} espacio(s) eliminado(s) por completo y ${left} espacio(s) compartido(s) abandonado(s). Tu acceso a esos datos quedo revocado.`,
      );
      setPurgeConfirmText('');
      router.refresh();
    });
  }

  return (
    <div>
      <div className="rounded-lg border border-white/10 bg-elevated p-4">
        <p className="text-sm font-medium text-stone-200">Descargar mis datos</p>
        <p className="mt-1 text-xs text-stone-500">
          Genera un archivo JSON con tu perfil, espacios, cuentas, documentos, movimientos y bitacora de auditoria.
        </p>
        <button
          type="button"
          onClick={handleExport}
          disabled={isPending}
          className={cn(
            'mt-3 rounded-lg bg-wealth px-4 py-2 text-sm font-medium text-white transition hover:bg-wealth-hover',
            isPending && 'opacity-60',
          )}
        >
          {isPending ? 'Preparando...' : 'Descargar JSON'}
        </button>
      </div>

      <div className="mt-4 rounded-lg border border-red-900/50 bg-red-950/20 p-4">
        <p className="text-sm font-medium text-stone-200">Eliminar mis datos</p>
        <p className="mt-1 text-xs text-stone-500">
          Si eres el unico miembro de un espacio, se elimina por completo (cuentas, categorias, documentos y
          movimientos). En espacios compartidos, simplemente los abandonas y pierdes acceso de inmediato. Esta accion
          no se puede deshacer.
        </p>
        <label htmlFor="purge-confirm" className="mt-3 block text-xs text-stone-400">
          Escribe <span className="font-semibold text-red-400">{CONFIRM_PHRASE}</span> para habilitar el boton.
        </label>
        <input
          id="purge-confirm"
          value={purgeConfirmText}
          onChange={(e) => setPurgeConfirmText(e.target.value)}
          className="mt-1 w-full rounded-lg border border-white/10 bg-obsidian px-3 py-2 text-sm text-stone-100 focus:border-red-500 focus:outline-none focus:ring-1 focus:ring-red-500"
        />
        <button
          type="button"
          onClick={handlePurge}
          disabled={isPending || purgeConfirmText !== CONFIRM_PHRASE}
          className="mt-3 rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-red-500 disabled:cursor-not-allowed disabled:opacity-40"
        >
          {isPending ? 'Eliminando...' : 'Eliminar definitivamente'}
        </button>
      </div>

      {purgeSummary && <p className="mt-3 text-xs text-emerald-400">{purgeSummary}</p>}
      {error && <p className="mt-3 text-xs text-red-400">{error}</p>}
    </div>
  );
}
