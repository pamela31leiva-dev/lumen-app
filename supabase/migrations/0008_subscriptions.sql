-- =============================================================================
-- 0008_subscriptions.sql
-- Modelo de datos de planes Gratis/Pro/Premium — SIN procesador de pagos
-- conectado todavia. El plan se activa manualmente (UPDATE directo via
-- service_role, o una futura pantalla de admin) nunca por el propio usuario.
-- Los limites (max_*) quedan en NULL = sin definir/sin aplicar: se agregan
-- numeros concretos y la logica de bloqueo en una iteracion futura, cuando
-- se decidan. Este migration solo deja la infraestructura lista.
-- =============================================================================

create table public.subscriptions (
    id                   uuid primary key default gen_random_uuid(),
    user_id              uuid not null unique references public.profiles(id) on delete cascade,
    plan                 text not null default 'free' check (plan in ('free', 'pro', 'premium')),
    status               text not null default 'active' check (status in ('active', 'inactive', 'canceled')),

    -- Limites por plan. NULL = sin limite aplicado todavia (ver comentario de arriba).
    max_spaces           integer,
    max_monthly_records  integer,
    max_storage_mb       integer,

    activated_by         uuid references public.profiles(id),  -- quien activo el plan manualmente; null = nunca se toco el default
    notes                text,                                   -- anotacion libre del admin (ej. "Pro activado a mano 2026-09-10, pago por transferencia")

    started_at           timestamptz not null default now(),
    updated_at           timestamptz not null default now()
);

comment on table public.subscriptions is 'Plan Gratis/Pro/Premium por usuario. GARANTIA DE RETENCION (decision de producto deliberada): cambiar status a inactive/canceled NUNCA borra ni oculta spaces/transactions/receipts historicos -- no existe ningun trigger ni cascada que lo haga. Al reactivar, el usuario recupera acceso completo e intacto a su historico. Los limites max_* son NULL hasta que se definan numeros concretos; la app no debe hardcodear limites, siempre leerlos de aqui.';

create index idx_subscriptions_user on public.subscriptions (user_id);

create trigger trg_subscriptions_updated_at before update on public.subscriptions
    for each row execute function public.set_updated_at();

alter table public.subscriptions enable row level security;

-- El usuario ve su propio plan pero jamas puede auto-asignarselo: sin
-- policies de insert/update/delete para "authenticated", asi que solo
-- service_role (bypassea RLS) puede crear o cambiar un plan.
create policy subscriptions_select_own on public.subscriptions
    for select using (user_id = auth.uid());

-- Backfill: usuarios que ya existian antes de este migration quedan en Gratis/activo.
insert into public.subscriptions (user_id, plan, status)
select id, 'free', 'active' from public.profiles
on conflict (user_id) do nothing;

-- A partir de ahora, cada usuario nuevo nace con su plan Gratis/activo
-- automaticamente (mismo trigger que ya crea profile + Espacio Personal).
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
    v_full_name text;
begin
    v_full_name := new.raw_user_meta_data ->> 'full_name';

    insert into public.profiles (id, email, full_name, privacy_consent_at, terms_accepted_at)
    values (new.id, new.email, v_full_name, now(), now())
    on conflict (id) do nothing;

    insert into public.spaces (name, type, base_currency, owner_id)
    values ('Espacio Personal', 'personal', 'COP', new.id);

    insert into public.subscriptions (user_id, plan, status)
    values (new.id, 'free', 'active')
    on conflict (user_id) do nothing;

    return new;
end;
$$;
