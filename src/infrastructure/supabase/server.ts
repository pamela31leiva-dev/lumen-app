import { cookies } from 'next/headers';
import { createServerClient, type CookieOptions } from '@supabase/ssr';
import { getValidatedSupabaseEnv } from '@/infrastructure/supabase/env';

/**
 * Cliente Supabase para Server Components / Server Actions. Usa el JWT de la
 * sesion (cookies) por lo que toda consulta pasa por RLS como ese usuario —
 * nunca se usa aqui la service_role key.
 */
export async function getSupabaseServerClient() {
  const cookieStore = await cookies();
  const { url, anonKey } = getValidatedSupabaseEnv();

  return createServerClient(
    url,
    anonKey,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet: { name: string; value: string; options: CookieOptions }[]) {
          try {
            cookiesToSet.forEach(({ name, value, options }) => cookieStore.set(name, value, options));
          } catch {
            // set() puede fallar si se llama desde un Server Component durante render;
            // el middleware ya se encarga de refrescar la sesion en ese caso.
          }
        },
      },
    },
  );
}
