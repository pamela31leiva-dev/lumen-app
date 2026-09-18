-- =============================================================================
-- 0037_onboarding.sql
-- Fase 3 (plan "Lumen Guide"): Wizard de Bienvenida de 3 pasos.
-- =============================================================================
-- onboarding_completed_at marca cuando la persona termino el wizard de
-- bienvenida (saludo, tipo de espacio, meta + primera cuenta opcional). Los
-- perfiles YA EXISTENTES se marcan como completados de una sola vez con su
-- propio created_at -- nadie que ya usa Lumen debe ver el wizard aparecer de
-- sorpresa; solo las cuentas nuevas (creadas despues de esta migracion) nacen
-- con esta columna en NULL y ven el wizard en su primer ingreso. El backfill
-- vive DENTRO del "if not exists" para que sea seguro re-ejecutar este
-- script: solo corre la primera vez que se agrega la columna, nunca vuelve a
-- tocar perfiles que ya hayan completado (o no) el wizard despues de eso.
--
-- primary_goal guarda la meta que eligio en el paso 3, unicamente para que
-- Lumen pueda referirla despues (ej. mensajes de Lumen Guide) -- hoy no
-- condiciona ningun calculo.
-- =============================================================================

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
