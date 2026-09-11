-- Aplica solo la migracion 0013. Pega esto en el SQL Editor de Supabase y
-- dale Run. Habilita que profiles.email acepte NULL (requisito para el
-- "Modo Fantasma": inicio de sesion anonimo, sin correo) y actualiza
-- handle_new_user() para tolerarlo.
--
-- IMPORTANTE: ademas de correr este SQL, hay que habilitar "Anonymous
-- Sign-Ins" en Supabase Dashboard -> Authentication -> Sign In / Providers.
-- Ese toggle no se puede activar desde SQL ni desde la service role key.
-- Sin el, el Modo Fantasma cae de forma segura al login/registro normal
-- (no rompe nada, simplemente no ofrece la entrada anonima).

begin;

alter table public.profiles alter column email drop not null;

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
    v_full_name text;
begin
    v_full_name := coalesce(new.raw_user_meta_data ->> 'full_name', case when new.email is null then 'Invitado' else null end);

    insert into public.profiles (id, email, full_name)
    values (new.id, new.email, v_full_name)
    on conflict (id) do nothing;

    insert into public.spaces (name, type, base_currency, owner_id)
    values ('Espacio Personal', 'personal', 'COP', new.id);

    insert into public.subscriptions (user_id, plan, status)
    values (new.id, 'free', 'active')
    on conflict (user_id) do nothing;

    return new;
end;
$$;

commit;
