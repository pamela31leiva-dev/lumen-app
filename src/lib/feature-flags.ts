/**
 * Flags simples en codigo (no en base de datos): para prender/apagar
 * funcionalidad ya construida sin borrar el codigo. Cambiar aqui, no en
 * cada pantalla.
 */

/**
 * El boton "Continuar con Google" esta implementado (GoogleSignInButton +
 * /auth/callback) pero requiere habilitar el proveedor Google en el
 * dashboard de Supabase (Authentication > Providers) con credenciales de
 * Google Cloud. Mientras eso no este configurado, se oculta para no mostrar
 * un boton que fallaria al hacer clic.
 */
export const GOOGLE_AUTH_ENABLED = false;
