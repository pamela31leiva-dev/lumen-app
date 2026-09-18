-- Aplica solo la migracion 0037. Pega esto en el SQL Editor de Supabase y
-- dale Run. Agrega onboarding_completed_at y primary_goal a profiles para el
-- Wizard de Bienvenida de 3 pasos. Idempotente (el backfill de perfiles
-- existentes solo corre la primera vez que se agrega la columna).

begin;

do $$
begin
    if not exists (
        select 1 from information_schema.columns
        where table_schema = 'public' and table_name = 'profiles' and column_name = 'onboarding_completed_at'
    ) then
        alter table public.profiles add column onboarding_completed_at timestamptz;
        update public.profiles set onboarding_completed_at = created_at;
    end if;

    if not exists (
        select 1 from information_schema.columns
        where table_schema = 'public' and table_name = 'profiles' and column_name = 'primary_goal'
    ) then
        alter table public.profiles add column primary_goal text;
    end if;
end $$;

comment on column public.profiles.onboarding_completed_at is 'Cuando termino el wizard de bienvenida de 3 pasos. Perfiles previos a esta columna se retro-marcaron con su created_at para no mostrarles el wizard.';
comment on column public.profiles.primary_goal is 'Meta financiera elegida en el paso 3 del wizard (ver domain/types/onboarding.ts) -- hoy solo informativo/personalizacion futura.';

commit;
