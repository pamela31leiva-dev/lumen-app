-- Aplica solo la migracion 0012. Pega esto en el SQL Editor de Supabase y
-- dale Run. CRITICO: sin esto, cualquier espacio sin cuentas deja al usuario
-- atrapado al intentar confirmar un movimiento (el selector de Cuenta queda
-- vacio y bloquea el boton de Confirmar).

begin;

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

commit;
