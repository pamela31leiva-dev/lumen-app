-- Aplica solo la migracion 0014. Pega esto en el SQL Editor de Supabase y
-- dale Run. Agrega la columna is_business (default false) que distingue
-- movimientos de negocio de personales dentro del mismo espacio -- necesaria
-- para el etiquetado de naturaleza opcional y el micro-resumen de Picos de
-- Venta / Salud de Caja.

begin;

alter table public.transactions add column if not exists is_business boolean not null default false;

drop index if exists idx_transactions_business;
create index idx_transactions_business on public.transactions (space_id, is_business) where is_business;

commit;
