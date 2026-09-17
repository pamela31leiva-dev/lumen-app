-- Aplica solo la migracion 0034. Pega esto en el SQL Editor de Supabase y
-- dale Run. Agrega transactions.tax_treatment (heredado de la categoria al
-- confirmar, ajustable por movimiento), rellena el historico existente y
-- actualiza get_fiscal_summary para leerlo directamente. Idempotente.

begin;

do $$
begin
    if not exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'transactions' and column_name = 'tax_treatment') then
        alter table public.transactions add column tax_treatment text check (tax_treatment in ('gravado', 'exento', 'no_gravado', 'deducible', 'no_deducible'));
    end if;
end $$;

comment on column public.transactions.tax_treatment is 'Clasificacion fiscal heredada de la categoria al confirmar (ver confirmTransaction) -- ajustable por movimiento desde el historial sin afectar la categoria ni otros movimientos. null = sin clasificar.';

-- Backfill unico: todo movimiento confirmado que hoy no tiene tax_treatment
-- propio hereda el de su categoria actual, exactamente el mismo numero que
-- get_fiscal_summary ya reportaba via el JOIN en vivo -- esta migracion no
-- cambia ningun total existente, solo lo fija.
update public.transactions t
set tax_treatment = cft.tax_treatment
from public.category_fiscal_tags cft
where cft.category_id = t.category_id
  and cft.space_id = t.space_id
  and t.tax_treatment is null
  and t.status = 'confirmed';

create index if not exists idx_transactions_tax_treatment on public.transactions (space_id, tax_treatment) where tax_treatment is not null;

-- get_fiscal_summary (0030) ahora lee t.tax_treatment directamente en vez de
-- unir con category_fiscal_tags en vivo -- firma sin cambios, create or
-- replace idempotente.
create or replace function public.get_fiscal_summary(p_space_id uuid, p_year int default extract(year from timezone('utc', now()))::int)
returns jsonb
language sql
stable
security invoker
set search_path = public
as $$
    with year_txns as (
        select
            t.type,
            t.amount_base,
            t.withholding_tax_amount,
            extract(month from timezone('utc', t.transaction_date))::int as month,
            t.tax_treatment
        from public.transactions t
        where t.space_id = p_space_id
          and t.status = 'confirmed'
          and t.type in ('income', 'expense')
          and extract(year from timezone('utc', t.transaction_date)) = p_year
    ),
    totals as (
        select
            coalesce(sum(amount_base) filter (where type = 'income' and tax_treatment = 'gravado'), 0) as income_gravado,
            coalesce(sum(amount_base) filter (where type = 'income' and tax_treatment = 'exento'), 0) as income_exento,
            coalesce(sum(amount_base) filter (where type = 'income' and tax_treatment = 'no_gravado'), 0) as income_no_gravado,
            coalesce(sum(amount_base) filter (where type = 'income' and tax_treatment is null), 0) as income_unclassified,
            coalesce(sum(amount_base) filter (where type = 'expense' and tax_treatment = 'deducible'), 0) as expense_deducible,
            coalesce(sum(amount_base) filter (where type = 'expense' and tax_treatment = 'no_deducible'), 0) as expense_no_deducible,
            coalesce(sum(amount_base) filter (where type = 'expense' and tax_treatment is null), 0) as expense_unclassified,
            coalesce(sum(withholding_tax_amount), 0) as withholding_tax_total
        from year_txns
    ),
    monthly as (
        select
            month,
            coalesce(sum(amount_base) filter (where type = 'income' and tax_treatment = 'gravado'), 0) as income_gravado,
            coalesce(sum(amount_base) filter (where type = 'income' and tax_treatment = 'exento'), 0) as income_exento,
            coalesce(sum(amount_base) filter (where type = 'income' and tax_treatment = 'no_gravado'), 0) as income_no_gravado,
            coalesce(sum(amount_base) filter (where type = 'expense' and tax_treatment = 'deducible'), 0) as expense_deducible,
            coalesce(sum(amount_base) filter (where type = 'expense' and tax_treatment = 'no_deducible'), 0) as expense_no_deducible,
            coalesce(sum(withholding_tax_amount), 0) as withholding_tax_total
        from year_txns
        group by month
    )
    select jsonb_build_object(
        'year', p_year,
        'income_gravado', (select income_gravado from totals),
        'income_exento', (select income_exento from totals),
        'income_no_gravado', (select income_no_gravado from totals),
        'income_unclassified', (select income_unclassified from totals),
        'expense_deducible', (select expense_deducible from totals),
        'expense_no_deducible', (select expense_no_deducible from totals),
        'expense_unclassified', (select expense_unclassified from totals),
        'withholding_tax_total', (select withholding_tax_total from totals),
        'monthly', coalesce((
            select jsonb_agg(jsonb_build_object(
                'month', month,
                'income_gravado', income_gravado,
                'income_exento', income_exento,
                'income_no_gravado', income_no_gravado,
                'expense_deducible', expense_deducible,
                'expense_no_deducible', expense_no_deducible,
                'withholding_tax_total', withholding_tax_total
            ) order by month)
            from monthly
        ), '[]'::jsonb)
    )
$$;

commit;
