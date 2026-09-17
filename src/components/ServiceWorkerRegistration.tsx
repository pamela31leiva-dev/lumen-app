'use client';

import { useEffect } from 'react';

/**
 * Registro del Service Worker (public/sw.js) -- habilita instalar Lumen en
 * la pantalla de inicio en Android/Chrome (que, a diferencia de iOS, exige
 * un service worker registrado para considerar la app "instalable") y da
 * soporte de cache basico para el cascaron estatico. Ver public/sw.js para
 * la regla de que datos financieros nunca se cachean.
 *
 * Solo en produccion: en `next dev` los nombres de chunk NO cambian de hash
 * en cada guardado (a diferencia del build de produccion), asi que un
 * service worker cache-first ahi sirve JS viejo despues de cada edicion --
 * un problema real de testing local, detectado de primera mano viendo un
 * componente editado seguir mostrando su version anterior. En produccion
 * cada deploy genera nombres de archivo nuevos (hash de contenido), asi que
 * el cache-first nunca sirve un chunk viejo bajo una URL nueva.
 */
export function ServiceWorkerRegistration() {
  useEffect(() => {
    if (process.env.NODE_ENV !== 'production') return;
    if (!('serviceWorker' in navigator)) return;
    navigator.serviceWorker.register('/sw.js').catch((error) => {
      console.error('No se pudo registrar el service worker:', error);
    });
  }, []);

  return null;
}
