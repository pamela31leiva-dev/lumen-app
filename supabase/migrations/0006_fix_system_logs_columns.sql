-- "create table if not exists" en 0005 no hace nada si la tabla ya existia
-- (con menos columnas, de un intento previo). Este fix es idempotente y
-- funciona tanto si 0005 ya corrio bien como si dejo la tabla incompleta.

alter table public.system_logs add column if not exists stack text;
alter table public.system_logs add column if not exists digest text;
alter table public.system_logs add column if not exists context jsonb;
