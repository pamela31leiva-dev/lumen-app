import { createClient } from '@supabase/supabase-js';

/**
 * Cliente con SUPABASE_SERVICE_ROLE_KEY: bypassea RLS por completo.
 * Exclusivamente server-only, y solo para operaciones de sistema que no
 * pertenecen a un usuario especifico (hoy: telemetria en system_logs).
 * Para servir datos a un usuario SIEMPRE se usa el cliente con sesion
 * (infrastructure/supabase/server.ts), que si respeta RLS.
 */
export function getSupabaseServiceRoleClient() {
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!serviceRoleKey) return null;

  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}
