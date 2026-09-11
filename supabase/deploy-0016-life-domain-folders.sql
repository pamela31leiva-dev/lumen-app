-- Aplica solo la migracion 0016. Pega esto en el SQL Editor de Supabase y
-- dale Run. Agrega life_domain (Personal/Familiar/Salud -- Negocio ya lo
-- cubre is_business) para las "carpetas contextuales" de la interfaz.

begin;

alter table public.transactions
    add column if not exists life_domain text;

alter table public.transactions
    drop constraint if exists chk_transactions_life_domain;

alter table public.transactions
    add constraint chk_transactions_life_domain check (life_domain is null or life_domain in ('personal', 'familiar', 'salud'));

commit;
