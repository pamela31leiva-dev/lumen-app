-- =============================================================================
-- 0018_snapshot_rpc_and_data_integrity.sql
-- Auditoria tecnica (arquitecto/ingenieria de sistemas): 3 refactors de
-- estabilidad industrial para el Executive Action Board y la integridad de
-- datos multi-tenant.
--
-- 1) Snapshot Unico en PL/pgSQL: get_executive_board_snapshot(space_id)
--    reemplaza 9 round-trips paralelos por un unico objeto JSON, y mueve el
--    "Panorama Historico" (antes: TODAS las transacciones confirmadas de la
--    vida del espacio viajaban crudas al cliente solo para sumarlas por año
--    en JS) a un GROUP BY en Postgres. SECURITY INVOKER a proposito: corre
--    con los privilegios y RLS de quien llama, nunca los eleva -- exactamente
--    las mismas policies que ya gobiernan cada tabla individualmente.
--
-- 2) Blindaje de Concurrencia: is_default_account + indice unico parcial +
--    get_or_create_default_account() reemplazan el patron
--    select-luego-si-no-existe-insert de resolveAccountId (confirm.ts), que
--    podia crear dos cuentas "Efectivo" si dos requests llegaban a la vez
--    (ej. dos pestañas, o doble tap en movil con red lenta). Ademas, un CHECK
--    de base de datos hace imposible que is_business=true conviva con un
--    life_domain no nulo, sin importar que bug futuro en el codigo de la app
--    intente guardarlo asi.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- PARTE 1: SNAPSHOT UNICO DEL TABLERO
-- -----------------------------------------------------------------------------
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

    -- Reemplaza getAccountBalances: la vista account_balances + opening_balance en un solo paso.
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

    -- Reemplaza getPendingTransactions.
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

    -- Reemplaza getCategories.
    'categories', coalesce((
      select jsonb_agg(jsonb_build_object('id', c.id, 'name', c.name, 'kind', c.kind, 'is_system', c.is_system) order by c.kind, c.name)
      from categories c
      where c.space_id = p_space_id or c.space_id is null
    ), '[]'::jsonb),

    -- Reemplaza getSpaceMembers.
    'members', coalesce((
      select jsonb_agg(jsonb_build_object(
        'user_id', sm.user_id, 'role', sm.role, 'joined_at', sm.joined_at,
        'email', p.email, 'full_name', p.full_name
      ) order by sm.joined_at)
      from space_members sm
      join profiles p on p.id = sm.user_id
      where sm.space_id = p_space_id
    ), '[]'::jsonb),

    -- Reemplaza getTransactionHistory(spaceId, 5).
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

    -- Reemplaza getPendingBills.
    'bills', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', b.id, 'description', b.description, 'amount', b.amount,
        'currency', b.currency, 'due_date', b.due_date
      ) order by b.due_date)
      from bills b
      where b.space_id = p_space_id and b.status = 'pending'
    ), '[]'::jsonb),

    -- Reemplaza getMonthlyNetFlow: la suma ya viene hecha, no filas crudas.
    'monthly_net_flow', coalesce((
      select sum(case when t.type = 'income' then t.amount_base when t.type = 'expense' then -t.amount_base else 0 end)
      from transactions t
      where t.space_id = p_space_id and t.status = 'confirmed'
        and t.transaction_date >= date_trunc('month', timezone('utc', now()))
    ), 0),

    -- Reemplaza getYearlyOverview: antes viajaban TODAS las transacciones
    -- confirmadas del historico completo del espacio solo para sumarlas por
    -- año en JavaScript. Ahora el GROUP BY vive en Postgres.
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

    -- Alimenta hasActivityToday (motor de patrones) -- igual que hoy, sin
    -- filtrar por status: cualquier movimiento (incluso pendiente) con fecha
    -- de hoy ya cuenta como "actividad de hoy".
    'today_activity_dates', coalesce((
      select jsonb_agg(t.transaction_date)
      from transactions t
      where t.space_id = p_space_id
        and t.transaction_date >= date_trunc('day', timezone('utc', now()))
    ), '[]'::jsonb),

    -- Alimenta detectRecurringObligations + computeActivityStreak
    -- (getProactiveInsights) Y detectRecurringCashEvents (getCashFlowProjection):
    -- antes eran 2 consultas identicas de 12 meses ejecutadas por separado.
    'pattern_rows', coalesce((
      select jsonb_agg(jsonb_build_object(
        'description', t.description, 'amount_original', t.amount_original,
        'type', t.type, 'transaction_date', t.transaction_date
      ) order by t.transaction_date asc)
      from transactions t
      where t.space_id = p_space_id and t.status = 'confirmed'
        and t.transaction_date >= (timezone('utc', now()) - interval '12 months')
    ), '[]'::jsonb),

    -- Alimenta computeBusinessCashInsight (getBusinessCashInsight): sin
    -- cambios de forma, solo se mueve al snapshot unico.
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

comment on function public.get_executive_board_snapshot(uuid) is
  'Snapshot atomico del Executive Action Board: reemplaza 9 round-trips paralelos por un unico objeto JSON. SECURITY INVOKER -- corre con RLS del llamante, nunca eleva privilegios.';

-- -----------------------------------------------------------------------------
-- PARTE 2A: CUENTA POR DEFECTO SIN CONDICION DE CARRERA
-- -----------------------------------------------------------------------------
alter table public.accounts add column is_default_account boolean not null default false;

-- Backfill: marca como default la cuenta activa mas antigua de cada espacio
-- (mismo criterio que ya usaba resolveAccountId: order by created_at asc).
with ranked as (
    select id, row_number() over (partition by space_id order by created_at asc) as rn
    from public.accounts
    where is_active = true
)
update public.accounts a
set is_default_account = true
from ranked r
where a.id = r.id and r.rn = 1;

-- Garantiza a nivel de motor (no de aplicacion) que nunca haya 2 cuentas
-- default en el mismo espacio -- el mecanismo que hace atomico el insert de
-- get_or_create_default_account de abajo.
create unique index idx_accounts_one_default_per_space on public.accounts (space_id) where is_default_account;

create or replace function public.get_or_create_default_account(p_space_id uuid, p_user_id uuid, p_currency char(3))
returns uuid
language plpgsql
security invoker
set search_path = public
as $$
declare
    v_account_id uuid;
begin
    -- 1) Ya hay alguna cuenta activa (compatibilidad con espacios ya
    --    existentes, cuya cuenta mas antigua puede no estar marcada como
    --    default todavia si esta funcion nunca se habia llamado).
    select id into v_account_id
    from public.accounts
    where space_id = p_space_id and is_active = true
    order by created_at asc
    limit 1;

    if v_account_id is not null then
        return v_account_id;
    end if;

    -- 2) No hay ninguna cuenta: intenta crear la default de forma atomica.
    --    Si dos requests concurrentes llegan aqui a la vez (ej. doble tap en
    --    movil con red lenta), el indice unico parcial garantiza que solo
    --    una gana el insert -- la otra cae al ON CONFLICT sin duplicar.
    insert into public.accounts (space_id, name, type, currency, created_by, is_default_account)
    values (p_space_id, 'Efectivo', 'cash', p_currency, p_user_id, true)
    on conflict (space_id) where (is_default_account) do nothing
    returning id into v_account_id;

    if v_account_id is not null then
        return v_account_id;
    end if;

    -- 3) Perdio la carrera: la otra transaccion concurrente ya la creo.
    select id into v_account_id
    from public.accounts
    where space_id = p_space_id and is_default_account = true
    limit 1;

    return v_account_id;
end;
$$;

revoke all on function public.get_or_create_default_account(uuid, uuid, char(3)) from public;
grant execute on function public.get_or_create_default_account(uuid, uuid, char(3)) to authenticated;

comment on function public.get_or_create_default_account(uuid, uuid, char(3)) is
  'Resuelve/crea la cuenta por defecto de un espacio de forma atomica -- reemplaza el patron select-luego-insert de resolveAccountId, vulnerable a condicion de carrera.';

-- -----------------------------------------------------------------------------
-- PARTE 2B: INTEGRIDAD ESTRICTA NEGOCIO / DOMINIO DE VIDA
-- -----------------------------------------------------------------------------
-- Backfill defensivo: nunca deberia haber filas con is_business=true y
-- life_domain no nulo (la UI ya lo trata como mutuamente excluyente desde
-- 0016), pero sin este CHECK era solo disciplina de aplicacion.
update public.transactions set life_domain = null where is_business = true and life_domain is not null;

alter table public.transactions
    add constraint chk_transactions_business_domain check (is_business = false or life_domain is null);
