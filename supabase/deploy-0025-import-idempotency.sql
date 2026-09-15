-- Aplica solo la migracion 0025. Pega esto en el SQL Editor de Supabase y
-- dale Run. Crea import_batches (un registro por archivo CSV/Excel subido)
-- y agrega import_batch_id/import_row_hash a transactions, para detectar
-- "este archivo ya se importo" y "esta fila ya existe" antes de insertar.
-- Idempotente.

begin;

create table if not exists public.import_batches (
    id               uuid primary key default gen_random_uuid(),
    space_id         uuid not null references public.spaces(id) on delete cascade,
    uploaded_by      uuid references public.profiles(id) on delete set null,
    file_name        text not null,
    file_hash        text not null,
    file_size_bytes  bigint,
    row_count        int not null default 0,
    imported_count   int not null default 0,
    duplicate_count  int not null default 0,
    skipped_count    int not null default 0,
    created_at       timestamptz not null default now()
);

comment on table public.import_batches is 'Un registro por cada archivo CSV/Excel importado -- permite detectar "este archivo ya se subio antes" por espacio via file_hash (SHA-256 del contenido).';

create index if not exists idx_import_batches_space_hash on public.import_batches (space_id, file_hash);

alter table public.import_batches enable row level security;

drop policy if exists import_batches_select_member on public.import_batches;
create policy import_batches_select_member on public.import_batches
    for select using (public.is_space_member(space_id));

drop policy if exists import_batches_insert_editor on public.import_batches;
create policy import_batches_insert_editor on public.import_batches
    for insert with check (public.has_space_role(space_id, array['owner','admin','editor']::member_role[]));

do $$
begin
    if not exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'transactions' and column_name = 'import_batch_id') then
        alter table public.transactions add column import_batch_id uuid references public.import_batches(id) on delete set null;
    end if;
    if not exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'transactions' and column_name = 'import_row_hash') then
        alter table public.transactions add column import_row_hash text;
    end if;
end $$;

create index if not exists idx_transactions_import_row_hash on public.transactions (space_id, import_row_hash) where import_row_hash is not null;

comment on column public.transactions.import_row_hash is 'Huella determinista de la fila de origen (import) -- permite detectar si la MISMA fila ya se importo antes en este espacio, sin depender solo del nombre del archivo.';

commit;
