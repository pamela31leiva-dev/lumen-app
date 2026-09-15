-- =============================================================================
-- 0028_p3_analytics.sql
-- Bloque P3: Analitica Patrimonial Avanzada, Reportes/Presupuestos y un ajuste
-- de rendimiento. Todo el calculo numerico vive en Postgres (funciones SQL
-- deterministas) -- TypeScript solo deriva razones/porcentajes sobre esos
-- numeros ya sumados, nunca inventa ni estima nada con IA.
--
--   get_financial_history: serie mensual de activos/pasivos/patrimonio neto
--   + ingreso/gasto del mes, calculada desde CERO a partir del ledger de
--   transacciones (no depende de snapshots periodicos que podrian
--   desincronizarse) -- ver comentario en la funcion para el porque de la
--   suma acumulada via window function en vez de subconsultas correlacionadas.
--
--   budgets: presupuesto mensual opcional por categoria de gasto. No es un
--   sistema de sobres ni arrastra saldo entre meses -- el cumplimiento se
--   calcula comparando el gasto real del mes contra este numero fijo.
--
--   get_monthly_report: desglose de un mes (ingresos, gastos, gasto por
--   categoria vs. su presupuesto) en un unico round-trip, mismo patron que
--   get_executive_board_snapshot (0018) pero con su propio alcance -- nunca
--   se mezcla con ese snapshot para no acoplar dos cosas que cambian por
--   separado (el tablero en vivo vs. un reporte de un mes puntual).
--
--   idx_transactions_destination_account: account_balances (0001) hace join
--   por account_id U destination_account_id: el primero ya tenia indice
--   (0001), el segundo no -- afecta a get_financial_history y a cualquier
--   espacio con transferencias frecuentes.
-- =============================================================================

create index idx_transactions_destination_account on public.transactions (destination_account_id) where destination_account_id is not null;

-- -----------------------------------------------------------------------------
-- BUDGETS
-- -----------------------------------------------------------------------------
create table public.budgets (
    id             uuid primary key default gen_random_uuid(),
    space_id       uuid not null references public.spaces(id) on delete cascade,
    category_id    uuid not null references public.categories(id) on delete cascade,
    monthly_amount numeric(18,2) not null check (monthly_amount > 0),
    created_by     uuid not null references public.profiles(id),
    created_at     timestamptz not null default now(),
    updated_at     timestamptz not null default now(),
    unique (space_id, category_id)
);

comment on table public.budgets is 'Presupuesto mensual fijo por categoria de gasto (sin arrastre entre meses) -- usado por get_monthly_report para calcular cumplimiento.';

create trigger trg_budgets_updated_at before update on public.budgets
    for each row execute function public.set_updated_at();

alter table public.budgets enable row level security;

create policy budgets_select_member on public.budgets
    for select using (public.is_space_member(space_id));
create policy budgets_insert_editor on public.budgets
    for insert with check (public.has_space_role(space_id, array['owner','admin','editor']::member_role[]));
create policy budgets_update_editor on public.budgets
    for update using (public.has_space_role(space_id, array['owner','admin','editor']::member_role[]));
create policy budgets_delete_admin on public.budgets
    for delete using (public.has_space_role(space_id, array['owner','admin']::member_role[]));

-- -----------------------------------------------------------------------------
-- HISTORIA FINANCIERA (activos, pasivos, patrimonio neto, ingreso/gasto por mes)
-- -----------------------------------------------------------------------------
-- SECURITY INVOKER: corre con el RLS de quien llama, igual que
-- generate_due_recurring_incomes (0019) -- nunca expone datos de un espacio
-- ajeno aunque alguien adivine el uuid.
--
-- Por que window function y no N subconsultas correlacionadas: calcular el
-- saldo "a fecha X" para cada uno de los p_periods meses, por cada cuenta,
-- ingenuamente exigiria una sub-suma de transacciones POR mes Y POR cuenta
-- (O(periodos x cuentas) escaneos del ledger). En cambio, aqui se suma el
-- delta de CADA mes una sola vez (agrupado) y luego se acumula con
-- `sum(...) over (partition by account_id order by period_start)` -- una
-- sola pasada. La serie de meses arranca en el mes de la transaccion mas
-- antigua (no en p_periods atras) para que el saldo acumulado en el primer
-- mes solicitado ya incluya todo el historico previo; al final se recorta a
-- los ultimos p_periods meses.
--
-- Clasificacion activo/pasivo: se deriva del `account_type` ya existente
-- (0001) sin columna nueva -- 'credit_card' es la unica categoria que puede
-- representar deuda en este esquema. Un saldo de tarjeta de credito positivo
-- (a favor) no es una obligacion, por eso liabilities solo cuenta el saldo
-- cuando es negativo.
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
            a.opening_balance,
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
        group by a.id, a.type, a.opening_balance, am.period_start
    ),
    account_month_balances as (
        select
            account_id,
            account_type,
            period_start,
            opening_balance + sum(delta) over (partition by account_id order by period_start) as cumulative_balance
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

revoke all on function public.get_financial_history(uuid, int) from public;
grant execute on function public.get_financial_history(uuid, int) to authenticated;

comment on function public.get_financial_history(uuid, int) is
  'Serie mensual determinista de activos/pasivos/patrimonio neto (saldo acumulado a fin de cada mes) e ingreso/gasto de ese mes, para comparativas historicas y KPIs. security invoker: respeta RLS de quien llama.';

-- -----------------------------------------------------------------------------
-- REPORTE MENSUAL (ingresos, gastos, desglose por categoria vs. presupuesto)
-- -----------------------------------------------------------------------------
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
            bu.monthly_amount as budget_amount
        from public.categories c
        left join month_txns mt on mt.category_id = c.id and mt.type = 'expense'
        left join public.budgets bu on bu.category_id = c.id and bu.space_id = p_space_id
        where (c.space_id = p_space_id or c.space_id is null) and c.kind = 'expense'
        group by c.id, c.name, bu.monthly_amount
        having coalesce(sum(mt.amount_base), 0) > 0 or bu.monthly_amount is not null
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

revoke all on function public.get_monthly_report(uuid, date) from public;
grant execute on function public.get_monthly_report(uuid, date) to authenticated;

comment on function public.get_monthly_report(uuid, date) is
  'Reporte determinista de un mes: ingresos, gastos y desglose por categoria de gasto vs. su presupuesto (budgets), si tiene uno. security invoker: respeta RLS de quien llama.';
