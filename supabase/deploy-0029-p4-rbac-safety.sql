-- Aplica solo la migracion 0029. Pega esto en el SQL Editor de Supabase y
-- dale Run. Agrega un trigger que impide dejar un espacio sin ningun
-- propietario (role='owner') -- no toca ninguna politica RLS existente.
-- Idempotente.

begin;

create or replace function public.prevent_ownerless_space()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
    v_remaining_owners int;
begin
    if old.role <> 'owner' then
        return coalesce(new, old);
    end if;
    if TG_OP = 'UPDATE' and new.role = 'owner' then
        return new;
    end if;

    if TG_OP = 'DELETE' and not exists (select 1 from public.spaces where id = old.space_id) then
        return old;
    end if;

    select count(*) into v_remaining_owners
    from public.space_members
    where space_id = old.space_id and role = 'owner' and id <> old.id;

    if v_remaining_owners = 0 then
        raise exception 'Un espacio siempre debe tener al menos un propietario. Asigna otro owner antes de continuar.';
    end if;

    return coalesce(new, old);
end;
$$;

comment on function public.prevent_ownerless_space() is 'Bloquea el update/delete que dejaria un espacio sin ningun miembro role=owner -- cierra un hueco de space_members_update_admin (0001), que por lo demas sigue intacta.';

drop trigger if exists trg_prevent_ownerless_space on public.space_members;
create trigger trg_prevent_ownerless_space
    before update or delete on public.space_members
    for each row execute function public.prevent_ownerless_space();

commit;
