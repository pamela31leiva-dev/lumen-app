'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { createPendingFromRecurringObligation } from '@/actions/analytics';
import type { RecurringObligation } from '@/domain/types/analytics';

interface ProactiveAssistantBannerProps {
  spaceId: string;
  baseCurrency: string;
  recurringObligations: RecurringObligation[];
  hasActivityToday: boolean;
}

function formatMoney(value: number, currency: string) {
  try {
    return new Intl.NumberFormat('es-CO', { style: 'currency', currency, maximumFractionDigits: 0 }).format(value);
  } catch {
    return `${value.toLocaleString('es-CO')} ${currency}`;
  }
}

function todayKey() {
  return new Date().toISOString().slice(0, 10);
}

function scrollToQuickCapture() {
  document.getElementById('quick-capture')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

/**
 * Notificaciones conversacionales, nunca punitivas: obligaciones recurrentes
 * vencidas (segun el motor de patrones) y un check-in nocturno amable si no
 * hubo ningun movimiento en el dia. Todo calculado client-side sobre props ya
 * resueltas en el servidor (getProactiveInsights) — aqui solo se decide QUE
 * mostrar y CUANDO (la hora local del navegador, que el servidor no conoce).
 */
export function ProactiveAssistantBanner({
  spaceId,
  baseCurrency,
  recurringObligations,
  hasActivityToday,
}: ProactiveAssistantBannerProps) {
  const router = useRouter();
  const [mounted, setMounted] = useState(false);
  const [isEvening, setIsEvening] = useState(false);
  const [nightlyDismissed, setNightlyDismissed] = useState(false);
  const [actionedKeys, setActionedKeys] = useState<Set<string>>(new Set());
  const [pendingKey, setPendingKey] = useState<string | null>(null);

  useEffect(() => {
    setMounted(true);
    setIsEvening(new Date().getHours() >= 19);
    try {
      setNightlyDismissed(window.localStorage.getItem(`nightly-checkin-${spaceId}-${todayKey()}`) === '1');
    } catch {
      // localStorage puede fallar en navegacion privada; el check-in simplemente se muestra de nuevo, no es critico.
    }
  }, [spaceId]);

  function handleDismissNightly() {
    setNightlyDismissed(true);
    try {
      window.localStorage.setItem(`nightly-checkin-${spaceId}-${todayKey()}`, '1');
    } catch {
      // ver nota arriba
    }
  }

  function handleConfirmObligation(obligation: RecurringObligation) {
    setPendingKey(obligation.key);
    createPendingFromRecurringObligation(spaceId, obligation).then((result) => {
      setPendingKey(null);
      if (result.success) {
        setActionedKeys((prev) => new Set(prev).add(obligation.key));
        router.refresh();
      }
    });
  }

  // Se evita renderizar segun la hora/localStorage antes de montar, para no
  // desincronizar el HTML del servidor (que no conoce la hora local) con el del cliente.
  if (!mounted) return null;

  const visibleObligations = recurringObligations.filter((o) => o.isOverdue && !actionedKeys.has(o.key));
  const showNightlyCheckIn = isEvening && !hasActivityToday && !nightlyDismissed;

  if (visibleObligations.length === 0 && !showNightlyCheckIn) return null;

  return (
    <div className="flex flex-col gap-3">
      {visibleObligations.map((obligation) => (
        <div key={obligation.key} className="rounded-xl border border-gold/30 bg-gold-soft p-4">
          <p className="text-sm text-stone-100">
            Encontramos un patron: <span className="font-medium">{obligation.description}</span> suele registrarse
            por estas fechas y este mes todavia no aparece. ¿Se te paso, o ya lo pagaste y falta anotarlo?
          </p>
          <p className="amount mt-1 text-xs text-stone-500">
            Monto habitual {formatMoney(obligation.averageAmount, baseCurrency)} · sueles registrarlo cerca del dia{' '}
            {obligation.expectedDayOfMonth}
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => handleConfirmObligation(obligation)}
              disabled={pendingKey === obligation.key}
              className="amount rounded-lg bg-gold px-3 py-1.5 text-xs font-medium text-obsidian transition hover:bg-gold/90 disabled:opacity-60"
            >
              {pendingKey === obligation.key
                ? 'Guardando...'
                : `Si, confirmar ${formatMoney(obligation.averageAmount, baseCurrency)}`}
            </button>
            <button
              type="button"
              onClick={scrollToQuickCapture}
              className="rounded-lg border border-white/10 px-3 py-1.5 text-xs text-stone-300 transition hover:border-white/20"
            >
              Registrar gasto
            </button>
          </div>
        </div>
      ))}

      {showNightlyCheckIn && (
        <div className="rounded-xl border border-white/10 bg-elevated p-4">
          <p className="text-sm text-stone-100">¿Hubo movimientos hoy en este espacio, ingresos o egresos?</p>
          <div className="mt-3 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={scrollToQuickCapture}
              className="rounded-lg bg-wealth px-3 py-1.5 text-xs font-medium text-white transition hover:bg-wealth-hover"
            >
              Registrar ingreso
            </button>
            <button
              type="button"
              onClick={scrollToQuickCapture}
              className="rounded-lg bg-wealth px-3 py-1.5 text-xs font-medium text-white transition hover:bg-wealth-hover"
            >
              Registrar gasto
            </button>
            <button
              type="button"
              onClick={handleDismissNightly}
              className="rounded-lg border border-white/10 px-3 py-1.5 text-xs text-stone-300 transition hover:border-white/20"
            >
              Nada que registrar hoy
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
