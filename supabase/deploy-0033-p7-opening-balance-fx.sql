-- Aplica solo la migracion 0033. Pega esto en el SQL Editor de Supabase y
-- dale Run. Corrige que el saldo inicial de una cuenta en moneda
-- extranjera no se convertia a la moneda base (bug expuesto por 0032,
-- createAccount). Idempotente.

begin;

do $$
begin
    if not exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'accounts' and column_name = 'opening_balance_fx_rate') then
        alter table public.accounts add column opening_balance_fx_rate numeric(18,8) not null default 1;
    end if;
end $$;

comment on column public.accounts.opening_balance_fx_rate is 'Tasa currency -> moneda base del espacio vigente cuando se declaro/edito el saldo inicial. 1 si la cuenta ya esta en la moneda base (el caso de siempre, antes de 0032).';

create or replace view public.account_balances as
select
    a.id as account_id,
    a.space_id,
    a.name as account_name,
    a.type as account_type,
    a.currency as account_currency,
    a.is_active,
    round(a.opening_balance * a.opening_balance_fx_rate, 2)
        + coalesce(sum(case
            when t.type = 'income' and t.account_id = a.id then t.amount_base
            when t.type = 'expense' and t.account_id = a.id then -t.amount_base
            when t.type = 'transfer' and t.account_id = a.id then -t.amount_base
            when t.type = 'transfer' and t.destination_account_id = a.id then t.amount_base
            else 0
        end), 0) as current_balance,
    a.opening_balance
        + coalesce(sum(case
            when t.type = 'income' and t.account_id = a.id then t.amount_original
            when t.type = 'expense' and t.account_id = a.id then -t.amount_original
            when t.type = 'transfer' and t.account_id = a.id then -t.amount_original
            when t.type = 'transfer' and t.destination_account_id = a.id then t.amount_original
            else 0
        end), 0) as current_balance_original
from public.accounts a
left join public.transactions t
    on (t.account_id = a.id or t.destination_account_id = a.id)
    and t.status = 'confirmed'
group by a.id, a.space_id, a.name, a.type, a.currency, a.is_active, a.opening_balance, a.opening_balance_fx_rate;

comment on view public.account_balances is 'Saldo calculado deterministicamente por Postgres a partir de transacciones CONFIRMADAS. La IA nunca escribe este numero. current_balance esta en moneda base (via amount_base y opening_balance*opening_balance_fx_rate); current_balance_original es la suma cruda en la moneda propia de la cuenta.';

-- get_financial_history (0028): mismo fix, opening_balance*opening_balance_fx_rate
-- en vez de opening_balance crudo. Firma sin cambios -- create or replace idempotente.
create or replace function public.get_financial_history(p_space_id uuid, p_periods int default 12)
returns table (
    period_start date,
    assets       numeric,
    liabilities  numeric,
    net_worth    numeric,
    income       numeric,
    expense      numeric
)
language sql
stable
security invoker
set search_path = public
as $$
    with requested_months as (
        select (date_trunc('month', timezone('utc', now())) - (interval '1 month' * gs))::date as period_start
        from generate_series(0, greatest(p_periods - 1, 0)) as gs
    ),
    earliest_txn_month as (
        select date_trunc('month', min(transaction_date))::date as m
        from public.transactions
        where space_id = p_space_id and status = 'confirmed'
    ),
    series_start as (
        select least(
            (select min(period_start) from requested_months),
            coalesce((select m from earliest_txn_month), (select min(period_start) from requested_months))
        ) as m
    ),
    all_months as (
        select generate_series((select m from series_start), (select max(period_start) from requested_months), interval '1 month')::date as period_start
    ),
    account_month_deltas as (
        select
            a.id as account_id,
            a.type as account_type,
            round(a.opening_balance * a.opening_balance_fx_rate, 2) as opening_balance_base,
            am.period_start,
            coalesce(sum(case
                when t.type = 'income' and t.account_id = a.id then t.amount_base
                when t.type = 'expense' and t.account_id = a.id then -t.amount_base
                when t.type = 'transfer' and t.account_id = a.id then -t.amount_base
                when t.type = 'transfer' and t.destination_account_id = a.id then t.amount_base
                else 0
            end), 0) as delta
        from all_months am
        cross join public.accounts a
        left join public.transactions t
            on (t.account_id = a.id or t.destination_account_id = a.id)
            and t.status = 'confirmed'
            and date_trunc('month', t.transaction_date) = am.period_start
        where a.space_id = p_space_id
        group by a.id, a.type, a.opening_balance, a.opening_balance_fx_rate, am.period_start
    ),
    account_month_balances as (
        select
            account_id,
            account_type,
            period_start,
            opening_balance_base + sum(delta) over (partition by account_id order by period_start) as cumulative_balance
        from account_month_deltas
    ),
    period_totals as (
        select
            period_start,
            coalesce(sum(cumulative_balance) filter (where account_type <> 'credit_card'), 0) as assets,
            coalesce(-sum(cumulative_balance) filter (where account_type = 'credit_card' and cumulative_balance < 0), 0) as liabilities,
            coalesce(sum(cumulative_balance), 0) as net_worth
        from account_month_balances
        group by period_start
    ),
    month_flows as (
        select
            date_trunc('month', t.transaction_date)::date as period_start,
            coalesce(sum(case when t.type = 'income' then t.amount_base else 0 end), 0) as income,
            coalesce(sum(case when t.type = 'expense' then t.amount_base else 0 end), 0) as expense
        from public.transactions t
        where t.space_id = p_space_id and t.status = 'confirmed'
        group by 1
    )
    select
        rm.period_start,
        coalesce(pt.assets, 0) as assets,
        coalesce(pt.liabilities, 0) as liabilities,
        coalesce(pt.net_worth, 0) as net_worth,
        coalesce(mf.income, 0) as income,
        coalesce(mf.expense, 0) as expense
    from requested_months rm
    left join period_totals pt on pt.period_start = rm.period_start
    left join month_flows mf on mf.period_start = rm.period_start
    order by rm.period_start asc;
$$;

commit;
