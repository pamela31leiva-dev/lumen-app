-- =============================================================================
-- 0026_xml_ubl_invoices.sql
-- Soporte para Facturacion Electronica DIAN (XML UBL) -- Bloque P1-B. No se
-- crea un modelo paralelo: se reutilizan las 3 entidades que YA existen y ya
-- separan exactamente lo que la factura electronica exige separar:
--
--   XML original -> receipts (kind='invoice', ya existe desde 0001)
--                    ai_extracted_data = campos parseados (NIT, numero,
--                    fecha, subtotal, impuestos, total, CUFE, etc.)
--   Obligacion    -> bills (ya existe desde 0017) -- una factura recibida es
--                    una obligacion de pago, NO un movimiento confirmado.
--   Pago          -> transactions, via el markBillPaid ya existente (0017) --
--                    solo cuando la persona marca "ya la pague".
--
-- Unico cambio de esquema: enlazar bills con el receipt que la origino (la
-- evidencia XML), y una nueva fuente de captura para diferenciar un XML
-- parseado deterministicamente de una foto/documento interpretado por IA.
-- =============================================================================

alter table public.bills add column receipt_id uuid references public.receipts(id) on delete set null;

comment on column public.bills.receipt_id is 'Factura electronica (XML UBL) que origino esta obligacion, si aplica -- permite volver al documento original (NIT, CUFE, impuestos) desde la obligacion.';

alter type public.capture_source add value if not exists 'xml_invoice';

-- CUFE (Codigo Unico de Facturacion Electronica) como columna propia, no solo
-- dentro de ai_extracted_data: permite que Postgres (no la aplicacion)
-- garantice "cero facturas duplicadas" con un indice unico -- la misma
-- factura subida dos veces por accidente falla en el insert en vez de crear
-- una segunda obligacion silenciosa.
alter table public.receipts add column cufe text;

create unique index idx_receipts_cufe_unique on public.receipts (space_id, cufe) where cufe is not null;
