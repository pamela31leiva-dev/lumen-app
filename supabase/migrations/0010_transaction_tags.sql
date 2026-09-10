-- =============================================================================
-- 0010_transaction_tags.sql
-- Etiquetas cortas de subproyecto/iniciativa por transaccion (ej. "lonchera",
-- "matricula", "venta-camisetas") para espacios como Negocio o Proyecto donde
-- se manejan varias iniciativas a la vez. Son texto libre, no una tabla
-- formal como categories: la IA las detecta del lenguaje natural (ver
-- suggested_tags en AiExtractionResult) y el usuario las edita en la misma
-- confirmacion, sin abrir un menu de gestion aparte.
-- =============================================================================

alter table public.transactions add column tags text[] not null default '{}';

create index idx_transactions_tags on public.transactions using gin (tags);
