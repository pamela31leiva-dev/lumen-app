-- =============================================================================
-- 0027_p2_automation.sql
-- Bloque P2: Bandeja Automatica (P2-1) y Reglas Inteligentes por Comercio
-- (P2-2). P2-3 (sincronizar ingresos fijos y facturas con la proyeccion de
-- caja) no necesita esquema nuevo -- recurring_incomes y bills ya tienen todo
-- lo necesario, solo se conecta en el codigo de la aplicacion.
--
--   inbound_channels: tokens secretos (solo se guarda el hash) que permiten a
--   un sistema externo (reenvio de correo, Zapier/Make, un webhook
--   autorizado) subir un documento a un espacio SIN sesion de usuario --
--   valida el token, no un JWT de Supabase. Por eso su unica via de acceso
--   real es el endpoint /api/inbound/documents con la service_role key; las
--   politicas RLS de aqui solo gobiernan la GESTION del token (crear/ver/
--   revocar) desde la app, como owner/admin.
--
--   merchant_rules: reglas configurables por comercio -- si la descripcion de
--   una captura nueva contiene "pattern" (case-insensitive), se aplican
--   automaticamente categoria/cuenta/etiquetas/carpeta por defecto. Nunca
--   auto-confirma nada: solo pre-llena una transaccion que sigue en
--   pending_confirmation, igual que cualquier otra captura.
-- =============================================================================

create table public.inbound_channels (
    id            uuid primary key default gen_random_uuid(),
    space_id      uuid not null references public.spaces(id) on delete cascade,
    label         text not null default 'Canal automatico',
    token_hash    text not null unique,
    created_by    uuid not null references public.profiles(id),
    is_active     boolean not null default true,
    last_used_at  timestamptz,
    created_at    timestamptz not null default now()
);

comment on table public.inbound_channels is 'Tokens secretos (solo hash) para que un sistema externo suba documentos a este espacio via /api/inbound/documents, sin sesion de usuario.';

create index idx_inbound_channels_space on public.inbound_channels (space_id);

alter table public.inbound_channels enable row level security;

create policy inbound_channels_select_member on public.inbound_channels
    for select using (public.is_space_member(space_id));
create policy inbound_channels_insert_admin on public.inbound_channels
    for insert with check (public.has_space_role(space_id, array['owner','admin']::member_role[]));
create policy inbound_channels_update_admin on public.inbound_channels
    for update using (public.has_space_role(space_id, array['owner','admin']::member_role[]));
create policy inbound_channels_delete_admin on public.inbound_channels
    for delete using (public.has_space_role(space_id, array['owner','admin']::member_role[]));

create table public.merchant_rules (
    id            uuid primary key default gen_random_uuid(),
    space_id      uuid not null references public.spaces(id) on delete cascade,
    pattern       text not null,
    category_id   uuid references public.categories(id) on delete set null,
    account_id    uuid references public.accounts(id) on delete set null,
    tags          text[] not null default '{}',
    -- 'personal' | 'familiar' | 'salud' | 'negocio' (ver domain/folders.ts) -- null = no forzar carpeta.
    folder        text check (folder is null or folder in ('personal', 'familiar', 'salud', 'negocio')),
    is_active     boolean not null default true,
    created_by    uuid not null references public.profiles(id),
    created_at    timestamptz not null default now(),
    updated_at    timestamptz not null default now(),
    constraint chk_merchant_rules_pattern_not_empty check (length(trim(pattern)) > 0)
);

comment on table public.merchant_rules is 'Regla por comercio: si la descripcion de una captura nueva contiene "pattern" (case-insensitive), se aplican automaticamente categoria/cuenta/etiquetas/carpeta -- reduce la correccion manual sin saltarse pending_confirmation.';

create index idx_merchant_rules_space on public.merchant_rules (space_id) where is_active;

create trigger trg_merchant_rules_updated_at before update on public.merchant_rules
    for each row execute function public.set_updated_at();

alter table public.merchant_rules enable row level security;

create policy merchant_rules_select_member on public.merchant_rules
    for select using (public.is_space_member(space_id));
create policy merchant_rules_insert_editor on public.merchant_rules
    for insert with check (public.has_space_role(space_id, array['owner','admin','editor']::member_role[]));
create policy merchant_rules_update_editor on public.merchant_rules
    for update using (public.has_space_role(space_id, array['owner','admin','editor']::member_role[]));
create policy merchant_rules_delete_admin on public.merchant_rules
    for delete using (public.has_space_role(space_id, array['owner','admin']::member_role[]));
