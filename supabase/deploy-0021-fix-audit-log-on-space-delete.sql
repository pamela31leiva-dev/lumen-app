-- Aplica solo la migracion 0021. Pega esto en el SQL Editor de Supabase y
-- dale Run. Corrige un bug real: borrar un espacio con datos adentro
-- fallaba siempre por una violacion de llave foranea en audit_logs.
-- Idempotente (create or replace function).

begin;

create or replace function public.write_audit_log()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
    v_space_id uuid;
begin
    v_space_id := coalesce(new.space_id, old.space_id);

    if not exists (select 1 from public.spaces where id = v_space_id) then
        return coalesce(new, old);
    end if;

    insert into public.audit_logs (space_id, actor_id, entity_type, entity_id, action, old_data, new_data)
    values (
        v_space_id,
        auth.uid(),
        tg_table_name,
        coalesce(new.id, old.id),
        lower(tg_op),
        case when tg_op in ('update', 'delete') then to_jsonb(old) else null end,
        case when tg_op in ('insert', 'update') then to_jsonb(new) else null end
    );

    return coalesce(new, old);
end;
$$;

commit;
