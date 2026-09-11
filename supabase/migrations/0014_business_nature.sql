-- =============================================================================
-- 0014_business_nature.sql
-- Inteligencia para Microemprendimientos: una sola columna booleana que
-- distingue un movimiento de "negocio" de uno personal DENTRO del mismo
-- espacio, sin obligar a crear un espacio de tipo "business" aparte ni a
-- llenar un formulario extra. La IA la detecta del lenguaje natural (ver
-- is_business en AiExtractionResult, igual que ya hace con category/type/
-- tags) y el usuario la puede corregir en la misma confirmacion. Default
-- false (personal) para no romper ningun flujo existente.
-- =============================================================================

alter table public.transactions add column is_business boolean not null default false;

-- Acelera getBusinessCashInsight (picos de venta / liquidez operativa),
-- que siempre filtra por space_id + is_business + status = 'confirmed'.
create index idx_transactions_business on public.transactions (space_id, is_business) where is_business;
