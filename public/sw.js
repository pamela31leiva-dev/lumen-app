// Service Worker de Lumen -- Bloque P6 (PWA).
//
// Regla de oro de este archivo: un producto financiero NUNCA debe mostrar un
// saldo o movimiento en cache como si fuera el dato actual. Por eso esto NO
// es un service worker "cachea todo" (tipo Workbox por defecto) -- solo
// cachea el CASCARON estatico de la app (JS/CSS del build, iconos,
// manifest), y deja pasar sin tocar cualquier cosa que pueda contener datos
// financieros: llamadas a Supabase, rutas /api/, y toda navegacion de
// pagina (el HTML de /executive-board, /movimientos, etc. siempre se pide a
// la red). Eso da "consultas offline basicas" (la app abre, la interfaz
// carga) sin el riesgo de una cifra vieja disfrazada de actual.

const CACHE_VERSION = 'v1';
const STATIC_CACHE = `lumen-static-${CACHE_VERSION}`;

self.addEventListener('install', (event) => {
  // No precachea nada de entrada -- el cascaron se va llenando solo, a
  // medida que el navegador pide cada asset (ver fetch de abajo). Evita que
  // un install falle por un asset que cambio de nombre entre despliegues.
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((key) => key !== STATIC_CACHE).map((key) => caches.delete(key))))
      .then(() => self.clients.claim()),
  );
});

// Assets estaticos del build de Next (hasheados por contenido -- seguros de
// cachear indefinidamente) mas los assets publicos que no cambian entre
// visitas. Todo lo demas (paginas, /api/, Supabase) pasa directo a la red.
function isCacheableStaticAsset(url) {
  if (url.origin !== self.location.origin) return false;
  if (url.pathname.startsWith('/_next/static/')) return true;
  if (url.pathname.startsWith('/icons/')) return true;
  if (url.pathname === '/manifest.json') return true;
  return false;
}

self.addEventListener('fetch', (event) => {
  const { request } = event;

  // Solo GET es seguro de cachear; POST/PUT/DELETE (capturas, confirmaciones,
  // pagos) nunca deben pasar por este service worker.
  if (request.method !== 'GET') return;

  const url = new URL(request.url);

  if (!isCacheableStaticAsset(url)) {
    // Navegacion de paginas, /api/, Supabase, todo lo demas: red directa,
    // sin intervencion. Si la red falla (sin conexion), el navegador maneja
    // el error como lo haria sin service worker -- nunca se sirve una pagina
    // financiera vieja del cache.
    return;
  }

  event.respondWith(
    caches.open(STATIC_CACHE).then(async (cache) => {
      const cached = await cache.match(request);
      if (cached) return cached;

      try {
        const response = await fetch(request);
        if (response.ok) cache.put(request, response.clone());
        return response;
      } catch (error) {
        if (cached) return cached;
        throw error;
      }
    }),
  );
});
