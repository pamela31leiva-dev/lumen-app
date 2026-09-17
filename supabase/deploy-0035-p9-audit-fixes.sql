-- Aplica solo la migracion 0035. Pega esto en el SQL Editor de Supabase y
-- dale Run. Agrega un indice (space_id, category_id) a transactions --
-- hallazgo de la Auditoria P9 (rendimiento en reportes/reclasificacion
-- por categoria). Idempotente.

begin;

create index if not exists idx_transactions_category on public.transactions (space_id, category_id) where category_id is not null;

commit;
