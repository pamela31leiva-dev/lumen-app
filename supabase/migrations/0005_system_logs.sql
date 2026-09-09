-- =============================================================================
-- 0005_system_logs.sql
-- Destino $0 para la telemetria de errores: en vez de un proveedor de correo
-- de pago (Resend), src/lib/telemetry/reporter.ts escribe aqui usando el
-- SUPABASE_SERVICE_ROLE_KEY (bypassea RLS, uso server-only). No se define
-- ninguna policy de select/insert para 'authenticated' ni 'anon': con RLS
-- habilitado y cero policies, esos roles quedan sin ningun acceso — solo el
-- service_role puede leer o escribir esta tabla. Son logs de sistema, no
-- datos de un usuario especifico, por eso no viven bajo ninguna policy de
-- espacio/membresia.
-- =============================================================================

create table if not exists public.system_logs (
    id          uuid primary key default gen_random_uuid(),
    source      text not null,
    message     text not null,
    stack       text,
    digest      text,
    context     jsonb,
    created_at  timestamptz not null default now()
);

comment on table public.system_logs is 'Logs de errores/telemetria del sistema (no de un usuario). Solo accesible via service_role — sin policies para authenticated/anon.';

create index if not exists idx_system_logs_created_at on public.system_logs (created_at desc);
create index if not exists idx_system_logs_source on public.system_logs (source);

alter table public.system_logs enable row level security;
