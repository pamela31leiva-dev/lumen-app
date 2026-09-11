-- =============================================================================
-- 0021_fix_audit_log_on_space_delete.sql
-- Bug real descubierto probando Eliminacion de Cuenta y Datos (0020): borrar
-- un espacio con transacciones/cuentas/documentos fallaba SIEMPRE con
-- "insert or update on table audit_logs violates foreign key constraint
-- audit_logs_space_id_fkey". Causa: al hacer DELETE FROM spaces, Postgres
-- borra primero la fila de spaces y LUEGO cascada hacia accounts/
-- transactions/receipts; el trigger de auditoria de esas tablas (AFTER
-- DELETE) intenta escribir una fila NUEVA en audit_logs con ese space_id,
-- pero para ese momento el espacio ya no existe -- viola la llave foranea.
-- Nunca se habia notado porque nada en produccion habia intentado borrar un
-- espacio con datos reales adentro hasta ahora.
--
-- Fix: si el espacio referenciado ya no existe, no tiene sentido escribir
-- una entrada de auditoria nueva (audit_logs.space_id tambien cascadea desde
-- spaces, asi que esa fila desapareceria de inmediato junto con todo lo
-- demas) -- se omite el insert en ese caso especifico. El comportamiento
-- para un borrado individual normal (el espacio SI sigue existiendo) queda
-- identico a como era antes.
-- =============================================================================

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
