-- =============================================================================
-- 0024_create_space_rpc.sql
-- Corrige "No se pudo crear el espacio" (bug real, reproducido en vivo):
-- createSpace() hacia `insert(...).select('id').single()`, y Postgres evalua
-- el RETURNING de un INSERT bajo la MISMA politica de SELECT de la tabla
-- (spaces_select_member: is_space_member(id)). Esa politica depende de que
-- exista una fila en space_members -- pero esa fila la crea
-- trg_spaces_after_insert, un trigger AFTER INSERT que todavia NO ha
-- corrido en el instante en que Postgres evalua el RETURNING. Resultado:
-- Postgres rechaza el RETURNING con "new row violates row-level security
-- policy for table spaces", aunque el INSERT en si mismo sea perfectamente
-- valido (confirmado en vivo: el mismo insert SIN .select() encadenado
-- funciona sin problema).
--
-- Nunca se noto antes porque el UNICO otro lugar que inserta en spaces
-- (handle_new_user, en el registro) corre dentro de un trigger SECURITY
-- DEFINER sobre auth.users, que bypassea RLS por completo -- este bug solo
-- afecta la creacion de espacios ADICIONALES iniciada por la propia persona
-- desde la interfaz, a traves del cliente con sesion normal.
--
-- Fix: una funcion RPC SECURITY DEFINER que inserta y vuelve a leer el
-- espacio en el MISMO contexto (sin pasar nunca por la politica de SELECT
-- basada en membresia), validando ella misma auth.uid() y fijando
-- owner_id -- nunca confia en un owner_id que mande el cliente. La politica
-- RLS de insert (spaces_insert_any_authenticated) se deja intacta: seguia
-- siendo correcta, el problema nunca fue esa condicion.
-- =============================================================================

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
    -- trg_spaces_after_insert (0001) ya crea la membresia owner;
    -- trg_spaces_founder_pro_default (0023) ya aplica is_pro si corresponde.
    -- Ambos ya corrieron para cuando llegamos aqui (misma transaccion,
    -- statement de insert ya completo) -- esta lectura de vuelta corre como
    -- SECURITY DEFINER, nunca depende de is_space_member.

    return query select s.id, s.name, s.type, s.base_currency, s.is_pro from public.spaces s where s.id = v_space_id;
end;
$$;

revoke all on function public.create_space(text, space_type, char) from public;
grant execute on function public.create_space(text, space_type, char) to authenticated;

comment on function public.create_space(text, space_type, char) is
  'Crea un espacio y devuelve su fila en una sola llamada atomica, evitando el conflicto entre RETURNING y la politica de SELECT basada en membresia (esa fila de space_members la crea un trigger AFTER INSERT que aun no corrio en el instante del RETURNING).';
