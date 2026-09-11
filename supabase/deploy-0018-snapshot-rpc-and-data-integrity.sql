-- Aplica solo la migracion 0018. Pega esto en el SQL Editor de Supabase y
-- dale Run. Crea get_executive_board_snapshot (snapshot atomico del tablero),
-- get_or_create_default_account (cuenta por defecto sin condicion de carrera)
-- y el CHECK que impide is_business=true con life_domain no nulo.
-- Idempotente: se puede volver a correr sin romper nada.

begin;

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
            'category_id', t.category_id, 'category_name', c.name
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
    ), '[]'::jsonb)
  )
$$;

revoke all on function public.get_executive_board_snapshot(uuid) from public;
grant execute on function public.get_executive_board_snapshot(uuid) to authenticated;

do $$
begin
    if not exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'accounts' and column_name = 'is_default_account') then
        alter table public.accounts add column is_default_account boolean not null default false;
    end if;
end $$;

with ranked as (
    select id, row_number() over (partition by space_id order by created_at asc) as rn
    from public.accounts
    where is_active = true
)
update public.accounts a
set is_default_account = true
from ranked r
where a.id = r.id and r.rn = 1 and a.is_default_account = false;

create unique index if not exists idx_accounts_one_default_per_space on public.accounts (space_id) where is_default_account;

create or replace function public.get_or_create_default_account(p_space_id uuid, p_user_id uuid, p_currency char(3))
returns uuid
language plpgsql
security invoker
set search_path = public
as $$
declare
    v_account_id uuid;
begin
    select id into v_account_id
    from public.accounts
    where space_id = p_space_id and is_active = true
    order by created_at asc
    limit 1;

    if v_account_id is not null then
        return v_account_id;
    end if;

    insert into public.accounts (space_id, name, type, currency, created_by, is_default_account)
    values (p_space_id, 'Efectivo', 'cash', p_currency, p_user_id, true)
    on conflict (space_id) where (is_default_account) do nothing
    returning id into v_account_id;

    if v_account_id is not null then
        return v_account_id;
    end if;

    select id into v_account_id
    from public.accounts
    where space_id = p_space_id and is_default_account = true
    limit 1;

    return v_account_id;
end;
$$;

revoke all on function public.get_or_create_default_account(uuid, uuid, char(3)) from public;
grant execute on function public.get_or_create_default_account(uuid, uuid, char(3)) to authenticated;

update public.transactions set life_domain = null where is_business = true and life_domain is not null;

do $$
begin
    if not exists (select 1 from pg_constraint where conname = 'chk_transactions_business_domain') then
        alter table public.transactions
            add constraint chk_transactions_business_domain check (is_business = false or life_domain is null);
    end if;
end $$;

commit;
