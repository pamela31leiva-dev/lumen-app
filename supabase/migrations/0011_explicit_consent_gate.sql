-- =============================================================================
-- 0011_explicit_consent_gate.sql
-- Hasta ahora, handle_new_user() (0003) fijaba privacy_consent_at y
-- terms_accepted_at con now() automaticamente para TODO usuario nuevo,
-- incluidos los que entran por Google OAuth y nunca vieron el checkbox de
-- /register. Eso no es un consentimiento real conforme a la Ley 1581 de 2012
-- (Habeas Data): debe ser un acto explicito de la persona, no un valor por
-- defecto del backend.
--
-- Este migration:
--   1. Deja de auto-fijar esas columnas al crear el usuario (quedan NULL).
--   2. Resetea a NULL las de usuarios YA existentes, porque su "consentimiento"
--      previo nunca fue una accion explicita real -- es la unica forma
--      consistente de tratarlos (no hay como distinguir retroactivamente
--      quien si vio el checkbox de quien entro por Google sin verlo).
-- El gate en middleware.ts (ver src/infrastructure/supabase/middleware.ts)
-- redirige a /accept-terms mientras terms_accepted_at sea NULL.
-- =============================================================================

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
