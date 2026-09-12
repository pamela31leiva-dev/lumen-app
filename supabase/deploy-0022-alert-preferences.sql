-- Aplica solo la migracion 0022. Pega esto en el SQL Editor de Supabase y
-- dale Run. Agrega bill_reminder_days a spaces (umbral configurable de
-- "factura por vencer", antes fijo en 3 dias). Idempotente.

begin;

do $$
begin
    if not exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'spaces' and column_name = 'bill_reminder_days') then
        alter table public.spaces
            add column bill_reminder_days smallint not null default 3 check (bill_reminder_days between 1 and 30);
    end if;
end $$;

commit;
