-- Tu tabla system_logs quedo creada con solo (id, source, message,
-- created_at) porque un intento anterior la creo antes de que el script
-- 0005 completo corriera, y "create table if not exists" no agrega
-- columnas a una tabla que ya existe. Pega esto en el SQL Editor de
-- Supabase y dale Run — es idempotente, se puede correr de nuevo sin error.

begin;

alter table public.system_logs add column if not exists stack text;
alter table public.system_logs add column if not exists digest text;
alter table public.system_logs add column if not exists context jsonb;

commit;
