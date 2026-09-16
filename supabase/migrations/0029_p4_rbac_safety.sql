-- =============================================================================
-- 0029_p4_rbac_safety.sql
-- Bloque P4: Colaboracion y Roles RBAC. La auditoria de este bloque confirmo
-- que las politicas RLS de las 28 migraciones anteriores YA distinguen
-- correctamente los 4 roles (owner/admin/editor/viewer definidos desde 0001)
-- en cada tabla -- insert/update exige owner/admin/editor, delete exige
-- owner/admin, select exige solo ser miembro. Ningun cambio de esquema hacia
-- falta ahi.
--
-- El unico hueco real: space_members_update_admin (0001) permite a
-- cualquier owner/admin cambiar el `role` de CUALQUIER fila del espacio,
-- incluida la del propio owner -- nada impedia dejar un espacio sin ningun
-- 'owner' (ej. degradando por error al unico owner a 'admin'). Este trigger
-- cierra ese hueco a nivel de datos, sin tocar ninguna politica RLS
-- existente: se dispara ANTES de un update que saque el rol 'owner' de una
-- fila, o de un delete de una fila 'owner', y aborta si esa fila era la
-- ULTIMA con role='owner' en el espacio.
-- =============================================================================

create or replace function public.prevent_ownerless_space()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
    v_remaining_owners int;
begin
    -- Solo importa cuando la fila que se toca YA era 'owner' y (se borra, o
    -- su rol cambia a otra cosa) -- cualquier otro update/delete es irrelevante
    -- para este invariante.
    if old.role <> 'owner' then
        return coalesce(new, old);
    end if;
    if TG_OP = 'UPDATE' and new.role = 'owner' then
        return new;
    end if;

    -- Si el espacio ya no existe, esta fila se esta borrando en CASCADA junto
    -- con el (ej. deleteMyAccount borrando un espacio entero) -- no hay
    -- "espacio sin propietario" que proteger porque el espacio completo esta
    -- desapareciendo. Sin este chequeo, borrar cualquier espacio de un solo
    -- owner (el caso normal para toda cuenta nueva) quedaria bloqueado por
    -- error, rompiendo la eliminacion de cuenta.
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
