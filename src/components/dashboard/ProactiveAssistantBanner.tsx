'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { createPendingFromRecurringObligation } from '@/actions/analytics';
import type { RecurringObligation } from '@/domain/types/analytics';

interface ProactiveAssistantBannerProps {
  spaceId: string;
  baseCurrency: string;
  recurringObligations: RecurringObligation[];
}

function formatMoney(value: number, currency: string) {
  try {
    return new Intl.NumberFormat('es-CO', { style: 'currency', currency, maximumFractionDigits: 0 }).format(value);
  } catch {
    return `${value.toLocaleString('es-CO')} ${currency}`;
  }
}

function scrollToQuickCapture() {
  document.getElementById('quick-capture')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

/**
 * Notificaciones conversacionales, nunca punitivas: obligaciones recurrentes
 * vencidas segun el motor de patrones. El check-in general de "¿registraste
 * algo hoy?" vive ahora en DailyCheckInBubble (dos ventanas horarias,
 * estilo burbuja de chat) para no duplicar el mismo recordatorio en dos
 * lugares distintos de la pantalla.
 */
export function ProactiveAssistantBanner({ spaceId, baseCurrency, recurringObligations }: ProactiveAssistantBannerProps) {
  const router = useRouter();
  const [mounted, setMounted] = useState(false);
  const [actionedKeys, setActionedKeys] = useState<Set<string>>(new Set());
  const [pendingKey, setPendingKey] = useState<string | null>(null);

  useEffect(() => {
    setMounted(true);
  }, []);

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

  // Se evita renderizar antes de montar para no desincronizar el HTML del
  // servidor con el del cliente (actionedKeys/pendingKey son estado local).
  if (!mounted) return null;

  const visibleObligations = recurringObligations.filter((o) => o.isOverdue && !actionedKeys.has(o.key));
  if (visibleObligations.length === 0) return null;

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
    </div>
  );
}
