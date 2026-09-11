-- =============================================================================
-- 0013_anonymous_ghost_mode.sql
-- "Modo Fantasma": permite entrar a Lumen de inmediato via inicio de sesion
-- anonimo de Supabase Auth (signInAnonymously), sin formulario ni cuenta
-- obligatoria. Un usuario anonimo llega a auth.users con email = NULL, asi
-- que profiles.email (NOT NULL desde 0001) debe dejar de serlo, y
-- handle_new_user() (ultima version en 0011) debe tolerar ese caso.
--
-- Requiere ademas habilitar "Anonymous Sign-Ins" en Supabase Dashboard ->
-- Authentication -> Sign In / Providers -> Anonymous Sign-Ins. Sin ese
-- toggle (no controlable desde SQL ni desde la service role key), el
-- Modo Fantasma cae de forma segura al login/registro normal.
-- =============================================================================

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
