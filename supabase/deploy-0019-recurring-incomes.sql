-- Aplica solo la migracion 0019. Pega esto en el SQL Editor de Supabase y
-- dale Run. Crea la tabla recurring_incomes (ingresos fijos con ajuste
-- anual), la funcion generate_due_recurring_incomes y actualiza
-- get_executive_board_snapshot para incluirlos + folder en recent_activity.
-- Idempotente: se puede volver a correr sin romper nada.

begin;

create table if not exists public.recurring_incomes (
    id                        uuid primary key default gen_random_uuid(),
    space_id                  uuid not null references public.spaces(id) on delete cascade,
    description               text not null,
    amount                    numeric(18,2) not null check (amount > 0),
    currency                  char(3) not null default 'COP',
    is_business               boolean not null default false,
    life_domain               text check (life_domain is null or life_domain in ('personal', 'familiar', 'salud')),
    annual_adjustment_percent numeric(5,2) check (annual_adjustment_percent is null or annual_adjustment_percent between -100 and 100),
    adjustment_month          smallint not null default 1 check (adjustment_month between 1 and 12),
    is_active                 boolean not null default true,
    last_generated_period     date,
    last_adjusted_year        int,
    created_by                uuid not null references public.profiles(id),
    created_at                timestamptz not null default now(),
    updated_at                timestamptz not null default now(),
    constraint chk_recurring_incomes_business_domain check (is_business = false or life_domain is null)
);

create index if not exists idx_recurring_incomes_space on public.recurring_incomes (space_id) where is_active;

drop trigger if exists trg_recurring_incomes_updated_at on public.recurring_incomes;
create trigger trg_recurring_incomes_updated_at before update on public.recurring_incomes
    for each row execute function public.set_updated_at();

alter table public.recurring_incomes enable row level security;

drop policy if exists recurring_incomes_select_member on public.recurring_incomes;
create policy recurring_incomes_select_member on public.recurring_incomes
    for select using (public.is_space_member(space_id));

drop policy if exists recurring_incomes_insert_editor on public.recurring_incomes;
create policy recurring_incomes_insert_editor on public.recurring_incomes
    for insert with check (public.has_space_role(space_id, array['owner','admin','editor']::member_role[]));

drop policy if exists recurring_incomes_update_editor on public.recurring_incomes;
create policy recurring_incomes_update_editor on public.recurring_incomes
    for update using (public.has_space_role(space_id, array['owner','admin','editor']::member_role[]));

drop policy if exists recurring_incomes_delete_admin on public.recurring_incomes;
create policy recurring_incomes_delete_admin on public.recurring_incomes
    for delete using (public.has_space_role(space_id, array['owner','admin']::member_role[]));

create or replace function public.generate_due_recurring_incomes(p_space_id uuid)
returns int
language plpgsql
security invoker
set search_path = public
as $$
declare
    v_row record;
    v_current_month date := date_trunc('month', timezone('utc', now()))::date;
    v_current_year int := extract(year from timezone('utc', now()))::int;
    v_current_month_num int := extract(month from timezone('utc', now()))::int;
    v_amount numeric(18,2);
    v_should_adjust boolean;
    v_generated int := 0;
begin
    for v_row in
        select * from public.recurring_incomes
        where space_id = p_space_id
          and is_active = true
          and (last_generated_period is null or last_generated_period < v_current_month)
        for update skip locked
    loop
        v_amount := v_row.amount;
        v_should_adjust := v_row.annual_adjustment_percent is not null
            and v_current_month_num >= v_row.adjustment_month
            and (v_row.last_adjusted_year is null or v_row.last_adjusted_year < v_current_year);

        if v_should_adjust then
            v_amount := round(v_amount * (1 + v_row.annual_adjustment_percent / 100), 2);
        end if;

        insert into public.transactions (
            space_id, type, amount_original, currency_original, exchange_rate,
            source, status, description, transaction_date, is_business, life_domain,
            ai_raw_interpretation, created_by
        ) values (
            p_space_id, 'income', v_amount, v_row.currency, 1,
            'manual', 'pending_confirmation', v_row.description, timezone('utc', now()),
            v_row.is_business, v_row.life_domain,
            jsonb_build_object('recurring_income_id', v_row.id, 'recurring_income', true),
            v_row.created_by
        );

        update public.recurring_incomes
        set amount = v_amount,
            last_generated_period = v_current_month,
            last_adjusted_year = case when v_should_adjust then v_current_year else last_adjusted_year end
        where id = v_row.id;

        v_generated := v_generated + 1;
    end loop;

    return v_generated;
end;
$$;

revoke all on function public.generate_due_recurring_incomes(uuid) from public;
grant execute on function public.generate_due_recurring_incomes(uuid) to authenticated;

create or replace function public.get_executive_board_snapshot(p_space_id uuid)
returns jsonb
language sql
stable
security invoker
set search_path = public
as $$
  select jsonb_build_object(
    'space', (
      select jsonb_build_object('base_currency', s.base_currency)
      from spaces s
      where s.id = p_space_id
    ),
    'accounts', coalesce((
      select jsonb_agg(jsonb_build_object(
        'account_id', ab.account_id,
        'space_id', ab.space_id,
        'name', ab.account_name,
        'type', ab.account_type,
        'currency', ab.account_currency,
        'is_active', ab.is_active,
        'current_balance', ab.current_balance,
        'current_balance_original', ab.current_balance_original,
        'opening_balance', a.opening_balance
      ) order by ab.account_name)
      from account_balances ab
      join accounts a on a.id = ab.account_id
      where ab.space_id = p_space_id
    ), '[]'::jsonb),
    'pending_transactions', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', t.id,
        'type', t.type,
        'status', t.status,
        'source', t.source,
        'description', t.description,
        'amount_original', t.amount_original,
        'currency_original', t.currency_original,
        'confidence_score', t.confidence_score,
        'ai_raw_interpretation', t.ai_raw_interpretation,
        'account_id', t.account_id,
        'category_id', t.category_id,
        'transaction_date', t.transaction_date,
        'receipt_id', t.receipt_id,
        'created_at', t.created_at,
        'tags', t.tags,
        'is_business', t.is_business,
        'life_domain', t.life_domain
      ) order by t.created_at desc)
      from transactions t
      where t.space_id = p_space_id and t.status = 'pending_confirmation'
    ), '[]'::jsonb),
    'categories', coalesce((
      select jsonb_agg(jsonb_build_object('id', c.id, 'name', c.name, 'kind', c.kind, 'is_system', c.is_system) order by c.kind, c.name)
      from categories c
      where c.space_id = p_space_id or c.space_id is null
    ), '[]'::jsonb),
    'members', coalesce((
      select jsonb_agg(jsonb_build_object(
        'user_id', sm.user_id, 'role', sm.role, 'joined_at', sm.joined_at,
        'email', p.email, 'full_name', p.full_name
      ) order by sm.joined_at)
      from space_members sm
      join profiles p on p.id = sm.user_id
      where sm.space_id = p_space_id
    ), '[]'::jsonb),
    'recent_activity', coalesce((
      select jsonb_agg(row_json order by row_date desc) from (
        select
          jsonb_build_object(
            'id', t.id, 'type', t.type, 'description', t.description,
            'amount_original', t.amount_original, 'currency_original', t.currency_original,
            'transaction_date', t.transaction_date, 'tags', t.tags,
            'category_id', t.category_id, 'category_name', c.name,
            'is_business', t.is_business, 'life_domain', t.life_domain
          ) as row_json,
          t.transaction_date as row_date
        from transactions t
        left join categories c on c.id = t.category_id
        where t.space_id = p_space_id and t.status = 'confirmed'
        order by t.transaction_date desc
        limit 5
      ) recent
    ), '[]'::jsonb),
    'bills', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', b.id, 'description', b.description, 'amount', b.amount,
        'currency', b.currency, 'due_date', b.due_date
      ) order by b.due_date)
      from bills b
      where b.space_id = p_space_id and b.status = 'pending'
    ), '[]'::jsonb),
    'monthly_net_flow', coalesce((
      select sum(case when t.type = 'income' then t.amount_base when t.type = 'expense' then -t.amount_base else 0 end)
      from transactions t
      where t.space_id = p_space_id and t.status = 'confirmed'
        and t.transaction_date >= date_trunc('month', timezone('utc', now()))
    ), 0),
    'yearly_overview', coalesce((
      select jsonb_agg(jsonb_build_object(
        'year', y.yr, 'total_income', y.total_income, 'total_expense', y.total_expense,
        'net_flow', y.total_income - y.total_expense
      ) order by y.yr desc)
      from (
        select
          extract(year from timezone('utc', t.transaction_date))::int as yr,
          sum(case when t.type = 'income' then t.amount_base else 0 end) as total_income,
          sum(case when t.type = 'expense' then t.amount_base else 0 end) as total_expense
        from transactions t
        where t.space_id = p_space_id and t.status = 'confirmed'
        group by 1
      ) y
    ), '[]'::jsonb),
    'today_activity_dates', coalesce((
      select jsonb_agg(t.transaction_date)
      from transactions t
      where t.space_id = p_space_id
        and t.transaction_date >= date_trunc('day', timezone('utc', now()))
    ), '[]'::jsonb),
    'pattern_rows', coalesce((
      select jsonb_agg(jsonb_build_object(
        'description', t.description, 'amount_original', t.amount_original,
        'type', t.type, 'transaction_date', t.transaction_date
      ) order by t.transaction_date asc)
      from transactions t
      where t.space_id = p_space_id and t.status = 'confirmed'
        and t.transaction_date >= (timezone('utc', now()) - interval '12 months')
    ), '[]'::jsonb),
    'business_rows', coalesce((
      select jsonb_agg(jsonb_build_object(
        'type', t.type, 'amount_base', t.amount_base, 'transaction_date', t.transaction_date
      ) order by t.transaction_date asc)
      from transactions t
      where t.space_id = p_space_id and t.status = 'confirmed' and t.is_business = true
        and t.transaction_date >= (timezone('utc', now()) - interval '120 days')
    ), '[]'::jsonb),
    'recurring_incomes', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', ri.id, 'description', ri.description, 'amount', ri.amount, 'currency', ri.currency,
        'is_business', ri.is_business, 'life_domain', ri.life_domain,
        'annual_adjustment_percent', ri.annual_adjustment_percent, 'adjustment_month', ri.adjustment_month,
        'is_active', ri.is_active, 'last_generated_period', ri.last_generated_period
      ) order by ri.created_at asc)
      from recurring_incomes ri
      where ri.space_id = p_space_id
    ), '[]'::jsonb)
  )
$$;

revoke all on function public.get_executive_board_snapshot(uuid) from public;
grant execute on function public.get_executive_board_snapshot(uuid) to authenticated;

commit;
