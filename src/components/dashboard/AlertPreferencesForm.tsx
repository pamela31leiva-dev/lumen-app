'use client';

import { useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { updateAlertPreferences } from '@/actions/settings';

interface AlertPreferencesFormProps {
  spaceId: string;
  currentBillReminderDays: number;
  canEdit: boolean;
}

/**
 * Preferencias de Alertas: el umbral de "factura por vencer" vivia
 * hardcodeado en 3 dias en dos componentes de cliente (BillAlerts,
 * ActionFeed) -- ahora cada espacio lo decide. No hay envio de correo/push
 * todavia (arquitectura $0 sin proveedor de notificaciones conectado), asi
 * que esto gobierna unicamente los avisos DENTRO de la app.
 */
export function AlertPreferencesForm({ spaceId, currentBillReminderDays, canEdit }: AlertPreferencesFormProps) {
  const router = useRouter();
  const [days, setDays] = useState(String(currentBillReminderDays));
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setSaved(false);
    const parsed = Number(days);
    if (!Number.isInteger(parsed) || parsed < 1 || parsed > 30) {
      setError('Escribe un numero entero entre 1 y 30.');
      return;
    }

    setIsSaving(true);
    updateAlertPreferences(spaceId, parsed).then((result) => {
      setIsSaving(false);
      if (!result.success) {
        setError(result.error);
        return;
      }
      setSaved(true);
      router.refresh();
    });
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-2">
      <label className="text-xs font-medium text-stone-300">Avisar de una factura por vencer con cuantos dias de anticipacion</label>
      <div className="flex items-center gap-2">
        <input
          type="number"
          min={1}
          max={30}
          value={days}
          disabled={!canEdit || isSaving}
          onChange={(e) => {
            setDays(e.target.value);
            setSaved(false);
          }}
          className="w-20 rounded-lg border border-white/10 bg-obsidian px-3 py-2 text-sm text-stone-100 focus:border-emerald-600 focus:outline-none focus:ring-1 focus:ring-emerald-600 disabled:opacity-60"
        />
        <span className="text-xs text-stone-500">dias</span>
        {canEdit && (
          <button
            type="submit"
            disabled={isSaving || days === String(currentBillReminderDays)}
            className="ml-2 rounded-lg bg-wealth px-3 py-2 text-xs font-medium text-white transition hover:bg-wealth-hover disabled:opacity-50"
          >
            {isSaving ? 'Guardando...' : 'Guardar'}
          </button>
        )}
      </div>
      {error && <p className="text-xs text-red-400">{error}</p>}
      {saved && !error && <p className="text-xs text-growth">Guardado.</p>}
      {!canEdit && <p className="text-[11px] text-stone-600">Solo owner/admin pueden cambiar esto.</p>}
    </form>
  );
}
