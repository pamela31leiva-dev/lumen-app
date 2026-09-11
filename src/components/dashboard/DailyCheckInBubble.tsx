'use client';

import { useEffect, useState } from 'react';

interface DailyCheckInBubbleProps {
  spaceId: string;
  hasActivityToday: boolean;
}

type Window = 'midday' | 'evening';

// Texto definitivo de los recordatorios de Claridad: directo, sin metaforas
// ni culpa -- solo la accion financiera (ver feedback del 2026-09-11).
const WINDOW_COPY: Record<Window, string> = {
  midday: '¿Hubo movimientos en la mañana? Registra ingresos o egresos ahora.',
  evening: '¿Cuentas cerradas? Pon tu espacio al dia antes de descansar.',
};

function todayKey() {
  return new Date().toISOString().slice(0, 10);
}

function currentWindow(): Window | null {
  const hour = new Date().getHours();
  if (hour >= 12 && hour < 19) return 'midday';
  if (hour >= 19) return 'evening';
  return null;
}

function scrollToQuickCapture() {
  document.getElementById('quick-capture')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

/**
 * Burbuja flotante estilo chat (WhatsApp) que invita, sin culpa ni sensacion
 * de escasez, a registrar movimientos en el bloque horario del mediodia o de
 * la noche -- solo si la persona ya abrio la app y todavia no registro nada
 * hoy. Deliberadamente NO es una notificacion push del sistema operativo
 * (eso exigiria Service Worker + suscripciones + un backend que las dispare
 * a las 12:30/19:30 exactas, infraestructura que esta arquitectura $0
 * serverless no tiene hoy): es un recordatorio dentro de la app, visible
 * solo mientras la persona la tiene abierta. Reemplaza el aviso nocturno
 * unico que vivia en ProactiveAssistantBanner -- dos ventanas con este mismo
 * tono, en vez de sumar una alerta mas encima de la otra.
 */
export function DailyCheckInBubble({ spaceId, hasActivityToday }: DailyCheckInBubbleProps) {
  const [mounted, setMounted] = useState(false);
  const [windowNow, setWindowNow] = useState<Window | null>(null);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    const win = currentWindow();
    setWindowNow(win);
    setMounted(true);
    if (!win) return;
    try {
      setDismissed(window.localStorage.getItem(`checkin-${win}-${spaceId}-${todayKey()}`) === '1');
    } catch {
      // localStorage puede fallar en navegacion privada; la burbuja simplemente se muestra de nuevo, no es critico.
    }
  }, [spaceId]);

  function handleDismiss() {
    setDismissed(true);
    if (!windowNow) return;
    try {
      window.localStorage.setItem(`checkin-${windowNow}-${spaceId}-${todayKey()}`, '1');
    } catch {
      // ver nota arriba
    }
  }

  if (!mounted || !windowNow || hasActivityToday || dismissed) return null;

  return (
    <div className="fixed bottom-20 right-4 z-30 max-w-[calc(100vw-2rem)] sm:bottom-6 sm:right-6">
      <div className="animate-fade-scale-in relative w-80 max-w-full rounded-2xl rounded-br-sm border border-white/10 bg-elevated p-4 shadow-2xl shadow-black/50">
        <button
          type="button"
          onClick={handleDismiss}
          aria-label="Cerrar"
          className="absolute right-2 top-2 rounded-full p-1 text-stone-500 transition hover:bg-white/5 hover:text-stone-300"
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75} className="h-4 w-4">
            <path strokeLinecap="round" strokeLinejoin="round" d="M6 6l12 12M18 6 6 18" />
          </svg>
        </button>

        <div className="flex items-start gap-2.5 pr-4">
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-gold/15 text-base">💬</span>
          <p className="mt-0.5 text-sm text-stone-100">{WINDOW_COPY[windowNow]}</p>
        </div>

        <div className="mt-3 flex justify-end gap-2">
          <button type="button" onClick={handleDismiss} className="rounded-lg px-3 py-1.5 text-xs text-stone-400 hover:text-stone-200">
            Ahora no
          </button>
          <button
            type="button"
            onClick={() => {
              handleDismiss();
              scrollToQuickCapture();
            }}
            className="rounded-lg bg-gold px-3 py-1.5 text-xs font-medium text-obsidian transition hover:bg-gold/90"
          >
            Registrar
          </button>
        </div>
      </div>
    </div>
  );
}
