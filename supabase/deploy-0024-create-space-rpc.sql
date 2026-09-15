-- Aplica solo la migracion 0024. Pega esto en el SQL Editor de Supabase y
-- dale Run. Corrige "No se pudo crear el espacio" con una funcion RPC
-- atomica. Idempotente (create or replace function).

begin;

create or replace function public.create_space(p_name text, p_type space_type, p_base_currency char(3) default 'COP')
returns table (id uuid, name text, type space_type, base_currency char(3), is_pro boolean)
language plpgsql
security definer
set search_path = public
as $$
declare
    v_user_id uuid := auth.uid();
    v_trimmed_name text := trim(p_name);
    v_space_id uuid;
begin
    if v_user_id is null then
        raise exception 'No autorizado';
    end if;
    if v_trimmed_name = '' then
        raise exception 'El espacio necesita un nombre.';
    end if;

    insert into public.spaces (name, type, base_currency, owner_id)
    values (v_trimmed_name, p_type, coalesce(p_base_currency, 'COP'), v_user_id)
    returning spaces.id into v_space_id;

    return query select s.id, s.name, s.type, s.base_currency, s.is_pro from public.spaces s where s.id = v_space_id;
end;
$$;

revoke all on function public.create_space(text, space_type, char) from public;
grant execute on function public.create_space(text, space_type, char) to authenticated;

commit;
