-- Aplica solo la migracion 0005 (ya aplicaste 0001-0004 antes). Pega esto en
-- el SQL Editor de Supabase y dale Run. Es idempotente: se puede correr de
-- nuevo sin error si hace falta.

begin;

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

commit;
