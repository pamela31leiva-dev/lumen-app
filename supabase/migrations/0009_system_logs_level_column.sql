-- La tabla system_logs en produccion tiene columnas (level, user_id,
-- space_id) que se agregaron en algun momento fuera de las migraciones
-- versionadas (probablemente a mano en el editor de tablas de Supabase).
-- level quedo NOT NULL sin default, lo que hacia fallar en silencio cada
-- insert de reportError() -- por eso system_logs seguia vacia pese a fixes
-- anteriores. Este migration alinea el esquema versionado con la realidad,
-- para que un despliegue fresco (deploy-all.sql) no repita el mismo bug.

alter table public.system_logs add column if not exists level text not null default 'error';
-- Si la columna ya existia (como en produccion) "add column if not exists"
-- no toca su default: se fija aparte para que quede igual en ambos casos.
alter table public.system_logs alter column level set default 'error';
alter table public.system_logs add column if not exists user_id uuid references public.profiles(id) on delete set null;
alter table public.system_logs add column if not exists space_id uuid references public.spaces(id) on delete set null;
