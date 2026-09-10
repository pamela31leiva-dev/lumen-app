const JWT_SHAPE = /^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/;

/**
 * Valida NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY antes de
 * pasarselas a createClient/createServerClient/createBrowserClient.
 *
 * Existe porque un valor pegado mal en el dashboard de Vercel (ej. la misma
 * key pegada 3 veces con saltos de linea de por medio) no lanza ningun error
 * al leer process.env — el fetch interno de Supabase recien revienta con un
 * "Headers.set: ... is an invalid header value" cripticamente generico, sin
 * decir cual variable ni por que. Esta validacion falla rapido y en
 * castellano claro senalando exactamente cual variable revisar.
 */
export function getValidatedSupabaseEnv(): { url: string; anonKey: string } {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim();

  if (!url || !anonKey) {
    throw new Error(
      'Faltan NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY. Configuralas en las variables de entorno del proyecto (Vercel: Project Settings -> Environment Variables) y vuelve a desplegar.',
    );
  }

  if (!JWT_SHAPE.test(anonKey)) {
    throw new Error(
      'NEXT_PUBLIC_SUPABASE_ANON_KEY no tiene forma de JWT valido (debe ser 3 segmentos separados por puntos, sin saltos de linea). Revisa en Vercel que el valor no este pegado varias veces o con espacios/lineas extra, corrigelo y vuelve a desplegar.',
    );
  }

  return { url, anonKey };
}
