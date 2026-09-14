-- Aplica solo la migracion 0023. Pega esto en el SQL Editor de Supabase y
-- dale Run. Marca is_founder_access=true en pamela31leiva@gmail.com y
-- cualquier correo @30.com, y hace que TODOS sus espacios (existentes y
-- futuros) queden is_pro=true automaticamente. Idempotente.

begin;

do $$
begin
    if not exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'profiles' and column_name = 'is_founder_access') then
        alter table public.profiles add column is_founder_access boolean not null default false;
    end if;
end $$;

update public.profiles
set is_founder_access = true
where email = 'pamela31leiva@gmail.com' or email ilike '%@30.com';

update public.spaces s
set is_pro = true
from public.profiles p
where s.owner_id = p.id and p.is_founder_access = true and s.is_pro = false;

create or replace function public.apply_founder_pro_default()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
    if exists (select 1 from public.profiles where id = new.owner_id and is_founder_access = true) then
        new.is_pro := true;
    end if;
    return new;
end;
$$;

drop trigger if exists trg_spaces_founder_pro_default on public.spaces;
create trigger trg_spaces_founder_pro_default before insert on public.spaces
    for each row execute function public.apply_founder_pro_default();

create or replace function public.apply_founder_pro_on_profile_update()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
    if new.is_founder_access = true and old.is_founder_access is distinct from true then
        update public.spaces set is_pro = true where owner_id = new.id and is_pro = false;
    end if;
    return new;
end;
$$;

drop trigger if exists trg_profiles_founder_pro_sync on public.profiles;
create trigger trg_profiles_founder_pro_sync after update on public.profiles
    for each row execute function public.apply_founder_pro_on_profile_update();

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
    v_full_name text;
    v_is_founder boolean;
begin
    v_full_name := new.raw_user_meta_data ->> 'full_name';
    v_is_founder := (new.email = 'pamela31leiva@gmail.com' or new.email ilike '%@30.com');

    insert into public.profiles (id, email, full_name, privacy_consent_at, terms_accepted_at, is_founder_access)
    values (new.id, new.email, v_full_name, now(), now(), v_is_founder)
    on conflict (id) do nothing;

    insert into public.spaces (name, type, base_currency, owner_id)
    values ('Espacio Personal', 'personal', 'COP', new.id);

    return new;
end;
$$;

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
    ), '[]'::jsonb),
    'folder_distribution', coalesce((
      select jsonb_agg(jsonb_build_object(
        'is_business', d.is_business, 'life_domain', d.life_domain, 'total', d.total
      ) order by d.total desc)
      from (
        select is_business, life_domain, sum(amount_base) as total
        from transactions
        where space_id = p_space_id and status = 'confirmed' and type = 'expense'
          and transaction_date >= date_trunc('month', timezone('utc', now()))
        group by is_business, life_domain
      ) d
    ), '[]'::jsonb),
    'weekday_heat', coalesce((
      select jsonb_agg(jsonb_build_object('weekday', h.wd, 'total', h.total) order by h.wd)
      from (
        select extract(dow from timezone('utc', transaction_date))::int as wd, sum(amount_base) as total
        from transactions
        where space_id = p_space_id and status = 'confirmed' and type = 'expense'
          and transaction_date >= (timezone('utc', now()) - interval '90 days')
        group by 1
      ) h
    ), '[]'::jsonb),
    'anomalies', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', t.id, 'description', t.description, 'amount_base', t.amount_base,
        'category_name', c.name, 'transaction_date', t.transaction_date,
        'category_avg', round(stats.avg_amount, 2)
      ) order by t.amount_base desc)
      from transactions t
      join categories c on c.id = t.category_id
      join (
        select category_id, avg(amount_base) as avg_amount
        from transactions
        where space_id = p_space_id and status = 'confirmed' and type = 'expense' and category_id is not null
          and transaction_date >= (timezone('utc', now()) - interval '90 days')
        group by category_id
        having count(*) >= 4
      ) stats on stats.category_id = t.category_id
      where t.space_id = p_space_id and t.status = 'confirmed' and t.type = 'expense'
        and t.transaction_date >= (timezone('utc', now()) - interval '90 days')
        and t.amount_base > stats.avg_amount * 2.5
      limit 10
    ), '[]'::jsonb)
  )
$$;

revoke all on function public.get_executive_board_snapshot(uuid) from public;
grant execute on function public.get_executive_board_snapshot(uuid) to authenticated;

commit;
