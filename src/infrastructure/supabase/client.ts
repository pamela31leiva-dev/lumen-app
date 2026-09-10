import { createBrowserClient } from '@supabase/ssr';
import { getValidatedSupabaseEnv } from '@/infrastructure/supabase/env';

/** Cliente Supabase para Client Components. Respeta RLS: opera como el usuario autenticado. */
export function getSupabaseBrowserClient() {
  const { url, anonKey } = getValidatedSupabaseEnv();
  return createBrowserClient(url, anonKey);
}
