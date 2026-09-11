-- Aplica solo la migracion 0015. Pega esto en el SQL Editor de Supabase y
-- dale Run. Agrega is_pro por espacio (monetizacion de capacidades de
-- negocio) y habilita Realtime sobre transactions (espacios colaborativos
-- en vivo).

begin;

alter table public.spaces add column if not exists is_pro boolean not null default false;

alter table public.transactions replica identity full;

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'transactions'
  ) then
    alter publication supabase_realtime add table public.transactions;
  end if;
end $$;

commit;
