-- =============================================================================
-- 0012_default_account_per_space.sql
-- Bug critico en movil: al confirmar una transaccion, "Cuenta" es
-- obligatoria (y debe serlo -- account_balances y chk_confirmed_is_complete
-- dependen de que toda transaccion CONFIRMADA tenga cuenta; sin eso el saldo
-- de esa transaccion no pertenece a ningun lado). Pero si el espacio no
-- tiene ninguna cuenta creada, el selector queda vacio y el usuario no
-- puede avanzar de ninguna forma.
--
-- Solucion: cada espacio SIEMPRE nace con una cuenta por defecto ("Efectivo"),
-- para que el selector nunca este vacio. Backfill para espacios existentes
-- + trigger actualizado para que todo espacio nuevo (registro, Google OAuth,
-- createSpace() manual) la tenga desde el primer momento.
-- =============================================================================

insert into public.accounts (space_id, name, type, currency, created_by)
select s.id, 'Efectivo', 'cash', s.base_currency, s.owner_id
from public.spaces s
where not exists (select 1 from public.accounts a where a.space_id = s.id);

create or replace function public.handle_new_space()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
    insert into public.space_members (space_id, user_id, role)
    values (new.id, new.owner_id, 'owner');

    insert into public.accounts (space_id, name, type, currency, created_by)
    values (new.id, 'Efectivo', 'cash', new.base_currency, new.owner_id);

    return new;
end;
$$;
