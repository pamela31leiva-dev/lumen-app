-- =============================================================================
-- 0030_p5_fiscal.sql
-- Bloque P5: Modulo Fiscal y Tributario (Colombia). Lumen NUNCA calcula
-- impuestos ni sugiere una interpretacion tributaria -- eso es trabajo de un
-- contador. Lo que si hace, deterministicamente: (a) deja que la persona
-- etiquete sus propias categorias/movimientos con el tratamiento fiscal que
-- YA conoce, y (b) suma esas etiquetas ya puestas, en Postgres, sin inventar
-- ni un peso. "La persona clasifica, Postgres suma."
--
-- category_fiscal_tags, no una columna en categories: las categorias del
-- sistema (space_id is null) son compartidas entre TODOS los espacios y su
-- politica de UPDATE (categories_update_editor, 0001) exige space_id is not
-- null -- nadie puede editarlas directo, por diseño. Una tabla aparte,
-- scoped por espacio, permite que cada espacio clasifique CUALQUIER
-- categoria (global o propia) a su manera, sin tocar esa proteccion.
--
-- transactions.withholding_tax_amount: la retencion en la fuente que un
-- pagador practico sobre un ingreso especifico -- varia por monto y por
-- quien paga, nunca es un atributo de la categoria, por eso es una columna
-- en la transaccion misma, no en category_fiscal_tags.
-- =============================================================================

create table public.category_fiscal_tags (
    id             uuid primary key default gen_random_uuid(),
    space_id       uuid not null references public.spaces(id) on delete cascade,
    category_id    uuid not null references public.categories(id) on delete cascade,
    -- gravado/exento/no_gravado aplican a categorias kind='income';
    -- deducible/no_deducible a kind='expense'. No se restringe por FK a
    -- categories.kind aqui (evitaria un JOIN en el check) -- la interfaz solo
    -- ofrece las opciones relevantes segun el tipo de la categoria.
    tax_treatment  text not null check (tax_treatment in ('gravado', 'exento', 'no_gravado', 'deducible', 'no_deducible')),
    created_by     uuid not null references public.profiles(id),
    created_at     timestamptz not null default now(),
    updated_at     timestamptz not null default now(),
    unique (space_id, category_id)
);

comment on table public.category_fiscal_tags is 'Clasificacion fiscal que UN ESPACIO le da a una categoria (global o propia) -- gravado/exento/no_gravado (ingresos) o deducible/no_deducible (gastos). La persona la asigna; Postgres solo suma, nunca interpreta ni calcula impuesto.';

create index idx_category_fiscal_tags_space on public.category_fiscal_tags (space_id);

create trigger trg_category_fiscal_tags_updated_at before update on public.category_fiscal_tags
    for each row execute function public.set_updated_at();

alter table public.category_fiscal_tags enable row level security;

create policy category_fiscal_tags_select_member on public.category_fiscal_tags
    for select using (public.is_space_member(space_id));
create policy category_fiscal_tags_insert_editor on public.category_fiscal_tags
    for insert with check (public.has_space_role(space_id, array['owner','admin','editor']::member_role[]));
create policy category_fiscal_tags_update_editor on public.category_fiscal_tags
    for update using (public.has_space_role(space_id, array['owner','admin','editor']::member_role[]));
create policy category_fiscal_tags_delete_admin on public.category_fiscal_tags
    for delete using (public.has_space_role(space_id, array['owner','admin']::member_role[]));

alter table public.transactions add column withholding_tax_amount numeric(18,2) check (withholding_tax_amount is null or withholding_tax_amount >= 0);

comment on column public.transactions.withholding_tax_amount is 'Retencion en la fuente que el pagador practico sobre ESTE movimiento (opcional, la declara la persona) -- no se calcula ni se infiere.';

-- -----------------------------------------------------------------------------
-- RESUMEN FISCAL ANUAL + MENSUAL
-- -----------------------------------------------------------------------------
-- SECURITY INVOKER: respeta RLS de quien llama, igual que get_financial_history
-- (0028) y generate_due_recurring_incomes (0019).
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
            cft.tax_treatment
        from public.transactions t
        left join public.category_fiscal_tags cft
            on cft.category_id = t.category_id and cft.space_id = t.space_id
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

revoke all on function public.get_fiscal_summary(uuid, int) from public;
grant execute on function public.get_fiscal_summary(uuid, int) to authenticated;

comment on function public.get_fiscal_summary(uuid, int) is
  'Resumen fiscal anual + mensual: suma movimientos confirmados por tratamiento fiscal ya etiquetado (category_fiscal_tags) y retenciones ya declaradas. Nunca calcula impuesto ni clasifica nada por su cuenta -- solo suma lo que la persona ya etiqueto. security invoker: respeta RLS de quien llama.';
