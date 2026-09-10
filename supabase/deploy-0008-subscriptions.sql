-- Aplica solo la migracion 0008. Pega esto en el SQL Editor de Supabase y
-- dale Run. Requiere que 0001-0007 ya esten aplicadas.

begin;

create table if not exists public.subscriptions (
    id                   uuid primary key default gen_random_uuid(),
    user_id              uuid not null unique references public.profiles(id) on delete cascade,
    plan                 text not null default 'free' check (plan in ('free', 'pro', 'premium')),
    status               text not null default 'active' check (status in ('active', 'inactive', 'canceled')),
    max_spaces           integer,
    max_monthly_records  integer,
    max_storage_mb       integer,
    activated_by         uuid references public.profiles(id),
    notes                text,
    started_at           timestamptz not null default now(),
    updated_at           timestamptz not null default now()
);

comment on table public.subscriptions is 'Plan Gratis/Pro/Premium por usuario. GARANTIA DE RETENCION: cambiar status a inactive/canceled NUNCA borra ni oculta datos historicos. Limites max_* en NULL hasta definir numeros concretos.';

create index if not exists idx_subscriptions_user on public.subscriptions (user_id);

drop trigger if exists trg_subscriptions_updated_at on public.subscriptions;
create trigger trg_subscriptions_updated_at before update on public.subscriptions
    for each row execute function public.set_updated_at();

alter table public.subscriptions enable row level security;

drop policy if exists subscriptions_select_own on public.subscriptions;
create policy subscriptions_select_own on public.subscriptions
    for select using (user_id = auth.uid());

insert into public.subscriptions (user_id, plan, status)
select id, 'free', 'active' from public.profiles
on conflict (user_id) do nothing;

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

commit;
