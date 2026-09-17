-- Aplica solo la migracion 0032. Pega esto en el SQL Editor de Supabase y
-- dale Run. Crea exchange_rates (cache de tasas de cambio) y
-- alternative_assets (inversiones/cripto/bienes alternativos); agrega
-- currency/fx_rate/monthly_amount_base a budgets. Idempotente.

begin;

-- -----------------------------------------------------------------------------
-- EXCHANGE_RATES (cache de tasas historicas/actuales, compartida entre spaces)
-- -----------------------------------------------------------------------------
create table if not exists public.exchange_rates (
    id              uuid primary key default gen_random_uuid(),
    from_currency   char(3) not null,
    to_currency     char(3) not null,
    rate_date       date not null,
    rate            numeric(24,10) not null check (rate > 0),
    source          text not null default 'open.er-api.com',
    fetched_at      timestamptz not null default now(),
    unique (from_currency, to_currency, rate_date)
);

comment on table public.exchange_rates is 'Cache de tasas de cambio (historicas y actuales). rate convierte de from_currency a to_currency: monto_to = monto_from * rate. Se escribe solo desde el servidor (service role); el cliente unicamente lee.';

create index if not exists idx_exchange_rates_lookup on public.exchange_rates (from_currency, to_currency, rate_date desc);

alter table public.exchange_rates enable row level security;

drop policy if exists exchange_rates_select_authenticated on public.exchange_rates;
create policy exchange_rates_select_authenticated on public.exchange_rates
    for select using (auth.role() = 'authenticated');

-- -----------------------------------------------------------------------------
-- ALTERNATIVE_ASSETS (inversiones, cripto, bienes patrimoniales alternativos)
-- -----------------------------------------------------------------------------
do $$
begin
    if not exists (select 1 from pg_type where typname = 'alternative_asset_type') then
        create type public.alternative_asset_type as enum ('crypto', 'stock', 'real_estate', 'vehicle', 'other');
    end if;
end $$;

create table if not exists public.alternative_assets (
    id              uuid primary key default gen_random_uuid(),
    space_id        uuid not null references public.spaces(id) on delete cascade,
    name            text not null,
    asset_type      public.alternative_asset_type not null default 'other',
    currency        char(3) not null,
    -- quantity*unit_value en vez de un solo "valor actual": para cripto/acciones
    -- la persona conoce cuanto TIENE (0.05 BTC) y cuanto VALE la unidad hoy por
    -- separado -- forzar un solo numero perderia esa trazabilidad. Para un bien
    -- de valor unico (una casa) quantity simplemente se deja en 1.
    quantity        numeric(24,8) not null default 1 check (quantity > 0),
    unit_value      numeric(18,2) not null check (unit_value >= 0),
    current_value   numeric(18,2) generated always as (round(quantity * unit_value, 2)) stored,
    valuation_date  date not null default current_date,
    notes           text,
    is_active       boolean not null default true,
    created_by      uuid not null references public.profiles(id),
    created_at      timestamptz not null default now(),
    updated_at      timestamptz not null default now()
);

comment on table public.alternative_assets is 'Inversiones, criptoactivos y bienes patrimoniales alternativos de un espacio. current_value es columna generada (quantity*unit_value): la persona declara cantidad y valor unitario, Postgres calcula el total, nunca el LLM.';

create index if not exists idx_alternative_assets_space on public.alternative_assets (space_id);

drop trigger if exists trg_alternative_assets_updated_at on public.alternative_assets;
create trigger trg_alternative_assets_updated_at before update on public.alternative_assets
    for each row execute function public.set_updated_at();

drop trigger if exists trg_alternative_assets_audit on public.alternative_assets;
create trigger trg_alternative_assets_audit after insert or update or delete
    on public.alternative_assets
    for each row execute function public.write_audit_log();

alter table public.alternative_assets enable row level security;

drop policy if exists alternative_assets_select_member on public.alternative_assets;
create policy alternative_assets_select_member on public.alternative_assets
    for select using (public.is_space_member(space_id));
drop policy if exists alternative_assets_insert_editor on public.alternative_assets;
create policy alternative_assets_insert_editor on public.alternative_assets
    for insert with check (public.has_space_role(space_id, array['owner','admin','editor']::member_role[]));
drop policy if exists alternative_assets_update_editor on public.alternative_assets;
create policy alternative_assets_update_editor on public.alternative_assets
    for update using (public.has_space_role(space_id, array['owner','admin','editor']::member_role[]));
drop policy if exists alternative_assets_delete_admin on public.alternative_assets;
create policy alternative_assets_delete_admin on public.alternative_assets
    for delete using (public.has_space_role(space_id, array['owner','admin']::member_role[]));

-- -----------------------------------------------------------------------------
-- BUDGETS multimoneda: mismo patron original+tasa+base que transactions
-- (0001), para poder fijar un presupuesto en una moneda distinta a la del
-- espacio sin romper la comparacion contra el gasto real (que siempre vive en
-- amount_base). El backfill deja el comportamiento actual intacto: toda fila
-- existente queda con currency = la moneda base de SU espacio y fx_rate = 1,
-- por lo que monthly_amount_base = monthly_amount exactamente como antes.
-- -----------------------------------------------------------------------------
do $$
begin
    if not exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'budgets' and column_name = 'currency') then
        alter table public.budgets add column currency char(3) not null default 'COP';
    end if;
    if not exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'budgets' and column_name = 'fx_rate') then
        alter table public.budgets add column fx_rate numeric(18,8) not null default 1;
    end if;
    if not exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'budgets' and column_name = 'monthly_amount_base') then
        alter table public.budgets add column monthly_amount_base numeric(18,2) generated always as (round(monthly_amount * fx_rate, 2)) stored;
    end if;
end $$;

update public.budgets b
set currency = s.base_currency
from public.spaces s
where s.id = b.space_id
  and b.currency is distinct from s.base_currency
  and b.fx_rate = 1;

comment on column public.budgets.currency is 'Moneda en la que la persona fijo el presupuesto. Default = moneda base del espacio (caso comun, sin friccion).';
comment on column public.budgets.fx_rate is 'Tasa currency -> moneda base del espacio, tomada de exchange_rates al guardar. 1 si currency ya es la moneda base.';
comment on column public.budgets.monthly_amount_base is 'monthly_amount convertido a la moneda base del espacio -- lo unico que get_monthly_report compara contra el gasto real (amount_base).';

-- get_monthly_report (0028) ahora compara contra monthly_amount_base en vez de
-- monthly_amount -- create or replace es idempotente, sin cambios de firma.
create or replace function public.get_monthly_report(p_space_id uuid, p_month date default date_trunc('month', timezone('utc', now()))::date)
returns jsonb
language sql
stable
security invoker
set search_path = public
as $$
    with bounds as (
        select
            date_trunc('month', p_month)::date as month_start,
            (date_trunc('month', p_month) + interval '1 month' - interval '1 day')::date as month_end
    ),
    month_txns as (
        select t.*
        from public.transactions t, bounds b
        where t.space_id = p_space_id and t.status = 'confirmed'
          and t.transaction_date >= b.month_start and t.transaction_date <= b.month_end
    ),
    totals as (
        select
            coalesce(sum(case when type = 'income' then amount_base else 0 end), 0) as total_income,
            coalesce(sum(case when type = 'expense' then amount_base else 0 end), 0) as total_expense
        from month_txns
    ),
    category_breakdown as (
        select
            c.id as category_id,
            c.name as category_name,
            coalesce(sum(mt.amount_base), 0) as total,
            bu.monthly_amount_base as budget_amount
        from public.categories c
        left join month_txns mt on mt.category_id = c.id and mt.type = 'expense'
        left join public.budgets bu on bu.category_id = c.id and bu.space_id = p_space_id
        where (c.space_id = p_space_id or c.space_id is null) and c.kind = 'expense'
        group by c.id, c.name, bu.monthly_amount_base
        having coalesce(sum(mt.amount_base), 0) > 0 or bu.monthly_amount_base is not null
    )
    select jsonb_build_object(
        'month_start', (select month_start from bounds),
        'month_end', (select month_end from bounds),
        'total_income', (select total_income from totals),
        'total_expense', (select total_expense from totals),
        'net_flow', (select total_income - total_expense from totals),
        'category_breakdown', coalesce((
            select jsonb_agg(jsonb_build_object(
                'category_id', category_id,
                'category_name', category_name,
                'total', total,
                'budget_amount', budget_amount
            ) order by total desc)
            from category_breakdown
        ), '[]'::jsonb)
    )
$$;

commit;
