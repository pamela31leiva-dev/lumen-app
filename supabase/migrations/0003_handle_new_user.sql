-- =============================================================================
-- 0003_handle_new_user.sql
-- Al registrarse en Supabase Auth, se crea automaticamente:
--   1. La fila en public.profiles (id = auth.users.id).
--   2. Un "Espacio Personal" con el nuevo usuario como owner.
-- El trigger trg_spaces_after_insert (0001) ya agrega la membresia owner
-- cuando se inserta el espacio, asi que no hay que duplicar esa logica aqui.
-- =============================================================================

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

    insert into public.profiles (id, email, full_name, privacy_consent_at, terms_accepted_at)
    values (new.id, new.email, v_full_name, now(), now())
    on conflict (id) do nothing;

    insert into public.spaces (name, type, base_currency, owner_id)
    values ('Espacio Personal', 'personal', 'COP', new.id);

    return new;
end;
$$;

create trigger trg_auth_users_after_insert
    after insert on auth.users
    for each row execute function public.handle_new_user();
