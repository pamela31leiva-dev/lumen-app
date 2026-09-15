-- =============================================================================
-- 0025_import_idempotency.sql
-- Idempotencia de BulkImportModal (Bloque P1-A): hasta ahora, volver a subir
-- el mismo extracto (por accidente, o porque alguien no recordaba que ya lo
-- habia importado) duplicaba TODAS las filas en silencio -- cero deteccion,
-- cero advertencia. Esta migracion agrega la infraestructura minima para
-- reconocer "este archivo ya se importo" y "esta fila ya existe" ANTES de
-- insertar, sin tocar el modelo financiero existente (transactions sigue
-- siendo la unica fuente de movimientos; import_batches es solo metadata de
-- trazabilidad).
-- =============================================================================

-- Un lote = un archivo subido una vez. file_hash es SHA-256 del contenido
-- del archivo (calculado en el navegador con Web Crypto antes de subir),
-- asi que dos archivos con distinto nombre pero el mismo contenido exacto
-- se reconocen como el mismo extracto.
create table public.import_batches (
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

create index idx_import_batches_space_hash on public.import_batches (space_id, file_hash);

alter table public.import_batches enable row level security;

create policy import_batches_select_member on public.import_batches
    for select using (public.is_space_member(space_id));
create policy import_batches_insert_editor on public.import_batches
    for insert with check (public.has_space_role(space_id, array['owner','admin','editor']::member_role[]));

-- Huella por fila (SHA-256 de space_id + fecha + monto + tipo + descripcion
-- normalizada, calculada en el servidor -- ver domain/import/parse-row.ts)
-- y referencia al lote que la creo, para deteccion de duplicados y
-- trazabilidad ("que archivo trajo este movimiento").
alter table public.transactions add column import_batch_id uuid references public.import_batches(id) on delete set null;
alter table public.transactions add column import_row_hash text;

create index idx_transactions_import_row_hash on public.transactions (space_id, import_row_hash) where import_row_hash is not null;

comment on column public.transactions.import_row_hash is 'Huella determinista de la fila de origen (import) -- permite detectar si la MISMA fila ya se importo antes en este espacio, sin depender solo del nombre del archivo.';
