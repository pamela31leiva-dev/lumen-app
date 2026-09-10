-- Aplica solo la migracion 0009. Pega esto en el SQL Editor de Supabase y
-- dale Run. Arregla que reportError() fallaba en silencio por una columna
-- "level" NOT NULL sin default en tu tabla system_logs.

begin;

alter table public.system_logs add column if not exists level text not null default 'error';
alter table public.system_logs alter column level set default 'error';
alter table public.system_logs add column if not exists user_id uuid references public.profiles(id) on delete set null;
alter table public.system_logs add column if not exists space_id uuid references public.spaces(id) on delete set null;

commit;
