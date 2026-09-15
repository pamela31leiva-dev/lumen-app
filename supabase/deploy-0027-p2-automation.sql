-- Aplica solo la migracion 0027. Pega esto en el SQL Editor de Supabase y
-- dale Run. Crea inbound_channels (tokens para la Bandeja Automatica via
-- /api/inbound/documents) y merchant_rules (categorizacion automatica por
-- comercio). Idempotente.

begin;

create table if not exists public.inbound_channels (
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

create index if not exists idx_inbound_channels_space on public.inbound_channels (space_id);

alter table public.inbound_channels enable row level security;

drop policy if exists inbound_channels_select_member on public.inbound_channels;
create policy inbound_channels_select_member on public.inbound_channels
    for select using (public.is_space_member(space_id));
drop policy if exists inbound_channels_insert_admin on public.inbound_channels;
create policy inbound_channels_insert_admin on public.inbound_channels
    for insert with check (public.has_space_role(space_id, array['owner','admin']::member_role[]));
drop policy if exists inbound_channels_update_admin on public.inbound_channels;
create policy inbound_channels_update_admin on public.inbound_channels
    for update using (public.has_space_role(space_id, array['owner','admin']::member_role[]));
drop policy if exists inbound_channels_delete_admin on public.inbound_channels;
create policy inbound_channels_delete_admin on public.inbound_channels
    for delete using (public.has_space_role(space_id, array['owner','admin']::member_role[]));

create table if not exists public.merchant_rules (
    id            uuid primary key default gen_random_uuid(),
    space_id      uuid not null references public.spaces(id) on delete cascade,
    pattern       text not null,
    category_id   uuid references public.categories(id) on delete set null,
    account_id    uuid references public.accounts(id) on delete set null,
    tags          text[] not null default '{}',
    folder        text check (folder is null or folder in ('personal', 'familiar', 'salud', 'negocio')),
    is_active     boolean not null default true,
    created_by    uuid not null references public.profiles(id),
    created_at    timestamptz not null default now(),
    updated_at    timestamptz not null default now(),
    constraint chk_merchant_rules_pattern_not_empty check (length(trim(pattern)) > 0)
);

comment on table public.merchant_rules is 'Regla por comercio: si la descripcion de una captura nueva contiene "pattern" (case-insensitive), se aplican automaticamente categoria/cuenta/etiquetas/carpeta -- reduce la correccion manual sin saltarse pending_confirmation.';

create index if not exists idx_merchant_rules_space on public.merchant_rules (space_id) where is_active;

drop trigger if exists trg_merchant_rules_updated_at on public.merchant_rules;
create trigger trg_merchant_rules_updated_at before update on public.merchant_rules
    for each row execute function public.set_updated_at();

alter table public.merchant_rules enable row level security;

drop policy if exists merchant_rules_select_member on public.merchant_rules;
create policy merchant_rules_select_member on public.merchant_rules
    for select using (public.is_space_member(space_id));
drop policy if exists merchant_rules_insert_editor on public.merchant_rules;
create policy merchant_rules_insert_editor on public.merchant_rules
    for insert with check (public.has_space_role(space_id, array['owner','admin','editor']::member_role[]));
drop policy if exists merchant_rules_update_editor on public.merchant_rules;
create policy merchant_rules_update_editor on public.merchant_rules
    for update using (public.has_space_role(space_id, array['owner','admin','editor']::member_role[]));
drop policy if exists merchant_rules_delete_admin on public.merchant_rules;
create policy merchant_rules_delete_admin on public.merchant_rules
    for delete using (public.has_space_role(space_id, array['owner','admin']::member_role[]));

commit;
