/**
 * Flags simples en codigo (no en base de datos): para prender/apagar
 * funcionalidad ya construida sin borrar el codigo. Cambiar aqui, no en
 * cada pantalla.
 */

/**
 * El boton "Continuar con Google" esta implementado (GoogleSignInButton +
 * /auth/callback). Requiere que el proveedor Google este habilitado en el
 * dashboard de Supabase (Authentication > Providers) con credenciales de
 * Google Cloud — ver instrucciones en ese panel. Si se apaga aqui antes de
 * completar ese paso, el boton no aparece (evita un boton que falle al
 * hacer clic).
 */
export const GOOGLE_AUTH_ENABLED = true;
