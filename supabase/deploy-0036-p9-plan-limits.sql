-- Aplica solo la migracion 0036. Pega esto en el SQL Editor de Supabase y
-- dale Run. Crea get_space_plan_limits (fuente unica de verdad Pro +
-- limites de plan) y agrega columnas a subscriptions para una futura
-- pasarela de pagos. Idempotente.

begin;

create or replace function public.get_space_plan_limits(p_space_id uuid)
returns table (
    owner_id             uuid,
    is_pro               boolean,
    max_spaces           integer,
    max_monthly_records  integer,
    max_storage_mb       integer
)
language sql
stable
security definer
set search_path = public
as $$
    select
        s.owner_id,
        (s.is_pro or coalesce(sub.plan in ('pro', 'premium') and sub.status = 'active', false)) as is_pro,
        sub.max_spaces,
        sub.max_monthly_records,
        sub.max_storage_mb
    from public.spaces s
    left join public.subscriptions sub on sub.user_id = s.owner_id
    where s.id = p_space_id;
$$;

revoke all on function public.get_space_plan_limits(uuid) from public;
grant execute on function public.get_space_plan_limits(uuid) to authenticated, service_role;

comment on function public.get_space_plan_limits(uuid) is
  'Fuente unica de verdad de si un espacio es Pro y sus limites de plan -- unifica spaces.is_pro (bandera manual) con subscriptions.plan/status (pago real) del dueño. Usar SIEMPRE esta funcion en vez de leer is_pro o subscriptions por separado.';

-- -----------------------------------------------------------------------------
-- Base para pasarela de pagos (Wompi/Stripe u otra, aun sin elegir): columnas
-- que un webhook de renovacion/cancelacion necesitara escribir. NULL hasta
-- que exista una integracion real -- ningun codigo las exige todavia.
-- -----------------------------------------------------------------------------
do $$
begin
    if not exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'subscriptions' and column_name = 'current_period_end') then
        alter table public.subscriptions add column current_period_end timestamptz;
    end if;
    if not exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'subscriptions' and column_name = 'provider') then
        alter table public.subscriptions add column provider text;
    end if;
    if not exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'subscriptions' and column_name = 'provider_reference') then
        alter table public.subscriptions add column provider_reference text;
    end if;
end $$;

comment on column public.subscriptions.current_period_end is 'Hasta cuando esta pagado el plan actual -- lo fija el webhook de la pasarela en cada renovacion exitosa. NULL mientras se active manualmente (activated_by) o no haya pasarela conectada.';
comment on column public.subscriptions.provider is 'Pasarela que gestiona este plan (ej. "wompi", "stripe") -- NULL si se activo a mano (activated_by) sin pago real todavia.';
comment on column public.subscriptions.provider_reference is 'ID de suscripcion/cliente en la pasarela externa, para conciliar el webhook con esta fila. Unico junto con provider cuando ambos estan presentes.';

create unique index if not exists idx_subscriptions_provider_reference
    on public.subscriptions (provider, provider_reference)
    where provider is not null and provider_reference is not null;

commit;
