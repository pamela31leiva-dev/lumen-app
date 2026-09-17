'use client';

import { useState, useTransition } from 'react';
import { exportUserData } from '@/actions/privacy';
import { AccountDeletionSection } from '@/components/dashboard/AccountDeletionSection';
import { cn } from '@/lib/utils';

/**
 * Contenido del Centro de Privacidad (Habeas Data), sin cromo de dialogo.
 * Se usa tanto dentro de PrivacyCenterModal (acceso rapido) como directamente
 * en la pagina /privacy (vista formal de pagina completa).
 *
 * El derecho de Supresion se ejerce con el MISMO componente que
 * /settings > Privacidad y Seguridad (AccountDeletionSection) -- este panel
 * antes tenia su propio flujo de purga (purgeUserData) que, a diferencia del
 * estandar actual, promovia en silencio a otro miembro como dueño de un
 * espacio compartido sin pedirle confirmacion a nadie. Ese flujo se elimino:
 * ahora, sin excepcion, ser dueño de un espacio compartido bloquea la
 * eliminacion hasta transferir la propiedad a mano.
 */
export function PrivacyCenterPanel() {
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function handleExport() {
    setError(null);
    startTransition(async () => {
      try {
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
      } catch (err) {
        console.error('Error de red al exportar los datos:', err);
        setError('Se perdio la conexion antes de generar el archivo. Intenta de nuevo.');
      }
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
      {error && <p className="mt-2 text-xs text-red-400">{error}</p>}

      <div className="mt-4 rounded-lg border border-red-900/50 bg-red-950/20 p-4">
        <p className="text-sm font-medium text-stone-200">Eliminar mis datos</p>
        <p className="mt-1 text-xs text-stone-500">
          Borra tu cuenta y los espacios de los que eres unica/o integrante, de forma permanente. Si sigues siendo
          dueña/o de un espacio compartido, primero debes transferir la propiedad o eliminar a los demas integrantes.
        </p>
        <div className="mt-3">
          <AccountDeletionSection />
        </div>
      </div>
    </div>
  );
}
