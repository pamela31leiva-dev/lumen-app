-- Aplica solo la migracion 0011. Pega esto en el SQL Editor de Supabase y
-- dale Run. IMPORTANTE: esto resetea privacy_consent_at/terms_accepted_at a
-- NULL para TODOS los usuarios existentes a proposito (ver comentario en el
-- archivo de migracion) -- todos veran el modal de aceptacion una vez en su
-- proximo inicio de sesion.

begin;

update public.profiles set privacy_consent_at = null, terms_accepted_at = null;

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
    v_full_name text;
begin
    v_full_name := new.raw_user_meta_data ->> 'full_name';

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
