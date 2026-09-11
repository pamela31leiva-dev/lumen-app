-- Aplica solo la migracion 0020. Pega esto en el SQL Editor de Supabase y
-- dale Run. Cambia las llaves foraneas hacia profiles(id) en 10 columnas
-- (created_by/uploaded_by/confirmed_by/actor_id/invited_by/activated_by) de
-- RESTRICT implicito a ON DELETE SET NULL, para que eliminar una cuenta
-- nunca falle ni borre el historico de espacios compartidos ajenos.
-- Idempotente: se puede volver a correr sin romper nada.

begin;

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

commit;
