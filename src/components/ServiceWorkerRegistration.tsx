'use client';

import { useEffect } from 'react';

/**
 * Registro del Service Worker (public/sw.js) -- habilita instalar Lumen en
 * la pantalla de inicio en Android/Chrome (que, a diferencia de iOS, exige
 * un service worker registrado para considerar la app "instalable") y da
 * soporte de cache basico para el cascaron estatico. Ver public/sw.js para
 * la regla de que datos financieros nunca se cachean.
 */
export function ServiceWorkerRegistration() {
  useEffect(() => {
    if (!('serviceWorker' in navigator)) return;
    navigator.serviceWorker.register('/sw.js').catch((error) => {
      console.error('No se pudo registrar el service worker:', error);
    });
  }, []);

  return null;
}
