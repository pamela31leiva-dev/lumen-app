-- Aplica solo la migracion 0010. Pega esto en el SQL Editor de Supabase y
-- dale Run.

begin;

alter table public.transactions add column if not exists tags text[] not null default '{}';

create index if not exists idx_transactions_tags on public.transactions using gin (tags);

commit;
