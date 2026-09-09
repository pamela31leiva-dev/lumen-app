/**
 * "Mantener sesion iniciada" vs "Cerrar sesion al salir".
 *
 * @supabase/ssr fija el maxAge de su cookie de sesion en 400 dias sin
 * importar que le pasemos a `cookieOptions.maxAge` (se verifico leyendo su
 * codigo fuente: cookies.js sobreescribe `maxAge` con su propio default al
 * escribir la cookie) — asi que no hay forma de controlar la duracion real
 * de la cookie desde aqui. La unica palanca honesta es sessionStorage, que
 * el navegador SI garantiza limpiar al cerrarse (a diferencia de una cookie).
 *
 * Por eso esto es una preferencia POR NAVEGADOR/DISPOSITIVO, no una
 * propiedad de la cuenta: se decide en cada login, no se guarda en `profiles`.
 */

export const SESSION_MODE_STORAGE_KEY = 'cf_remember_mode'; // localStorage: sobrevive a reinicios del navegador
export const SESSION_ACTIVE_MARKER_KEY = 'cf_session_active'; // sessionStorage: se borra al cerrar el navegador/pestaña

export type SessionMode = 'persistent' | 'ephemeral';

export function readStoredSessionMode(): SessionMode {
  if (typeof window === 'undefined') return 'persistent';
  return window.localStorage.getItem(SESSION_MODE_STORAGE_KEY) === 'ephemeral' ? 'ephemeral' : 'persistent';
}

/** Se llama justo despues de un login exitoso. */
export function persistSessionMode(mode: SessionMode): void {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(SESSION_MODE_STORAGE_KEY, mode);
  if (mode === 'ephemeral') {
    window.sessionStorage.setItem(SESSION_ACTIVE_MARKER_KEY, '1');
  } else {
    window.sessionStorage.removeItem(SESSION_ACTIVE_MARKER_KEY);
  }
}

/**
 * true si el usuario eligio "cerrar sesion al salir" Y el navegador se cerro
 * y volvio a abrir desde entonces (sessionStorage se limpio pero localStorage no).
 */
export function shouldTerminateEphemeralSession(): boolean {
  if (typeof window === 'undefined') return false;
  if (readStoredSessionMode() !== 'ephemeral') return false;
  return window.sessionStorage.getItem(SESSION_ACTIVE_MARKER_KEY) !== '1';
}
