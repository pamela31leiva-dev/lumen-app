-- =============================================================================
-- 0035_p9_audit_fixes.sql
-- Bloque P9: Auditoria de Seguridad, Rendimiento y Precision Financiera
-- =============================================================================
-- Hallazgo (rendimiento): transactions nunca tuvo un indice por category_id
-- solo. Con is_space_member ya filtrando por space_id, cualquier consulta
-- agrupada o filtrada por categoria (reportes por categoria, el nuevo
-- setCategoryFiscalTag que reclasifica en lote el historico de una
-- categoria, MerchantRulesManager) forzaba un escaneo del resto de columnas
-- del espacio en vez de saltar directo a las filas de esa categoria. A la
-- escala de miles de movimientos por espacio esto se nota.
-- =============================================================================

begin;

create index if not exists idx_transactions_category on public.transactions (space_id, category_id) where category_id is not null;

commit;
