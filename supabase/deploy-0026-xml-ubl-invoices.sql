-- Aplica solo la migracion 0026. Pega esto en el SQL Editor de Supabase y
-- dale Run. Enlaza bills con el receipt (XML UBL) que la origino y agrega
-- 'xml_invoice' a capture_source, para diferenciar una factura electronica
-- parseada deterministicamente de un documento interpretado por IA.
-- Idempotente.

begin;

do $$
begin
    if not exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'bills' and column_name = 'receipt_id') then
        alter table public.bills add column receipt_id uuid references public.receipts(id) on delete set null;
    end if;
end $$;

comment on column public.bills.receipt_id is 'Factura electronica (XML UBL) que origino esta obligacion, si aplica -- permite volver al documento original (NIT, CUFE, impuestos) desde la obligacion.';

alter type public.capture_source add value if not exists 'xml_invoice';

do $$
begin
    if not exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'receipts' and column_name = 'cufe') then
        alter table public.receipts add column cufe text;
    end if;
end $$;

create unique index if not exists idx_receipts_cufe_unique on public.receipts (space_id, cufe) where cufe is not null;

commit;
