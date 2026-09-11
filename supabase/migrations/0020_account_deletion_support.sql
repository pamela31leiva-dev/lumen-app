-- =============================================================================
-- 0020_account_deletion_support.sql
-- Eliminacion de Cuenta y Datos: prepara el esquema para que borrar un
-- perfil (profiles, en cascada desde auth.users) nunca falle por una
-- restriccion de llave foranea, SIN destruir el historico de espacios
-- compartidos donde la persona participaba sin ser dueña.
--
-- Hoy, columnas como transactions.created_by o receipts.uploaded_by
-- referencian profiles(id) sin ON DELETE (equivalente a RESTRICT): si
-- alguien alguna vez registro un movimiento en un espacio compartido del que
-- no es dueño, borrar su perfil fallaria en seco. La solucion NO es cascada
-- (eso borraria el historico financiero de sus compañeros de espacio), sino
-- ON DELETE SET NULL: la fila sobrevive, solo se pierde la atribucion de
-- quien la creo -- igual que "cuenta eliminada" en cualquier app colaborativa.
--
-- spaces.owner_id se deja intacto (ON DELETE RESTRICT): la aplicacion exige
-- explicitamente que la persona transfiera o borre sus espacios compartidos
-- antes de poder eliminar su cuenta (ver src/actions/account.ts) -- un
-- espacio con dueño fantasma nunca deberia poder existir en silencio.
-- =============================================================================

do $$
declare
    v_pair record;
    v_conname text;
begin
    for v_pair in
        select * from (values
            ('accounts', 'created_by'),
            ('receipts', 'uploaded_by'),
            ('transactions', 'created_by'),
            ('transactions', 'confirmed_by'),
            ('audit_logs', 'actor_id'),
            ('classification_hints', 'created_by'),
            ('bills', 'created_by'),
            ('recurring_incomes', 'created_by'),
            ('space_members', 'invited_by'),
            ('subscriptions', 'activated_by')
        ) as t(tbl, col)
    loop
        execute format('alter table public.%I alter column %I drop not null', v_pair.tbl, v_pair.col);

        select con.conname into v_conname
        from pg_constraint con
        where con.conrelid = format('public.%I', v_pair.tbl)::regclass
          and con.confrelid = 'public.profiles'::regclass
          and con.contype = 'f'
          and con.conkey = array(
              select attnum from pg_attribute
              where attrelid = format('public.%I', v_pair.tbl)::regclass and attname = v_pair.col
          );

        if v_conname is not null then
            execute format('alter table public.%I drop constraint %I', v_pair.tbl, v_conname);
        end if;

        execute format(
            'alter table public.%I add constraint %I foreign key (%I) references public.profiles(id) on delete set null',
            v_pair.tbl, v_pair.tbl || '_' || v_pair.col || '_fkey', v_pair.col
        );
    end loop;
end $$;
