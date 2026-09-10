-- =============================================================================
-- deploy-all.sql
-- Las 4 migraciones (0001-0004) consolidadas EN ORDEN para pegar en el SQL
-- Editor del dashboard de Supabase. Generado a partir de los archivos
-- individuales en supabase/migrations/ — esos son la fuente de verdad
-- historica (no idempotentes, pensados para correr una sola vez cada uno);
-- este archivo es una conveniencia de despliegue manual, y por eso es
-- 100% IDEMPOTENTE: se puede pegar y correr las veces que sea necesario sin
-- que falle por "ya existe". Patrones usados:
--   - CREATE TYPE (enum)   -> bloque DO con EXCEPTION WHEN duplicate_object
--   - CREATE TABLE         -> IF NOT EXISTS
--   - CREATE INDEX         -> IF NOT EXISTS
--   - CREATE TRIGGER       -> CREATE OR REPLACE TRIGGER (Postgres 14+)
--   - CREATE VIEW          -> CREATE OR REPLACE VIEW
--   - CREATE POLICY        -> DROP POLICY IF EXISTS + CREATE POLICY
--   - CREATE OR REPLACE FUNCTION / GRANT / REVOKE -> ya son idempotentes
--   - INSERT (seed)        -> indice unico parcial + ON CONFLICT DO NOTHING
--
-- Envuelto en una transaccion: si algo falla a mitad de camino, Postgres
-- revierte todo (nada queda a medio aplicar).
-- =============================================================================

begin;

-- =============================================================================
-- 0001_init_schema.sql
-- Plataforma de Inteligencia y Organizacion Financiera — Esquema base + RLS
-- =============================================================================
-- Principios aplicados:
--   1. La IA interpreta, la base de datos calcula, la persona decide.
--   2. RECEIPTS (documentos) y TRANSACTIONS son entidades separadas.
--   3. Aislamiento multi-tenant por "espacio" (space), forzado con RLS usando
--      auth.uid() — nunca se confia en un space_id enviado por el cliente sin
--      verificar membresia.
--   4. Todo dato generado por IA nace en estado PENDING_CONFIRMATION con
--      trazabilidad (fuente, confianza, interpretacion original).
--   5. Multimoneda: se guarda el monto/moneda original + tasa de cambio; el
--      monto en moneda base se calcula con una columna generada (STORED), NUNCA
--      por el LLM.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- EXTENSIONES
-- -----------------------------------------------------------------------------
create extension if not exists "pgcrypto";   -- gen_random_uuid()

-- -----------------------------------------------------------------------------
-- ENUMS (idempotente: CREATE TYPE no soporta IF NOT EXISTS, se atrapa el error)
-- -----------------------------------------------------------------------------
do $$ begin
    create type space_type as enum ('personal', 'family', 'business', 'project');
exception
    when duplicate_object then null;
end $$;

do $$ begin
    create type member_role as enum ('owner', 'admin', 'editor', 'viewer');
    -- owner: control total, incluye eliminar el espacio.
    -- admin: gestiona miembros, cuentas y categorias.
    -- editor: crea/edita/confirma transacciones y documentos.
    -- viewer: solo lectura (ideal para contador externo, pareja, etc).
exception
    when duplicate_object then null;
end $$;

do $$ begin
    create type account_type as enum ('cash', 'bank', 'credit_card', 'digital_wallet', 'investment', 'other');
exception
    when duplicate_object then null;
end $$;

do $$ begin
    create type movement_type as enum ('income', 'expense', 'transfer');
exception
    when duplicate_object then null;
end $$;

do $$ begin
    create type capture_source as enum ('manual', 'ai_text', 'ai_voice', 'ai_photo', 'ai_document', 'import', 'telegram');
exception
    when duplicate_object then null;
end $$;

do $$ begin
    create type record_status as enum ('pending_confirmation', 'confirmed', 'rejected', 'archived');
exception
    when duplicate_object then null;
end $$;

do $$ begin
    create type document_kind as enum ('receipt', 'invoice', 'bank_statement', 'contract', 'other');
exception
    when duplicate_object then null;
end $$;

-- -----------------------------------------------------------------------------
-- PROFILES  (extiende auth.users; jamas se referencia auth.users directamente
-- desde el resto del esquema para no acoplar RLS a su estructura interna)
-- -----------------------------------------------------------------------------
create table if not exists public.profiles (
    id                  uuid primary key references auth.users(id) on delete cascade,
    email               text not null,
    full_name           text,
    birthdate           date,
    locale              text not null default 'es-CO',
    base_currency       char(3) not null default 'COP',
    privacy_consent_at  timestamptz,           -- Habeas Data (Ley 1581/2012)
    terms_accepted_at   timestamptz,
    created_at          timestamptz not null default now(),
    updated_at          timestamptz not null default now(),
    constraint chk_profiles_adult check (birthdate is null or birthdate <= (current_date - interval '18 years'))
);

comment on table public.profiles is 'Perfil funcional del usuario. Verificacion de edad (+18) e infraestructura de consentimiento Habeas Data.';

-- -----------------------------------------------------------------------------
-- SPACES  (tenant raiz: Personal, Familiar, Negocio, Proyecto)
-- -----------------------------------------------------------------------------
create table if not exists public.spaces (
    id              uuid primary key default gen_random_uuid(),
    name            text not null,
    type            space_type not null default 'personal',
    base_currency   char(3) not null default 'COP',
    owner_id        uuid not null references public.profiles(id) on delete restrict,
    is_active       boolean not null default true,
    created_at      timestamptz not null default now(),
    updated_at      timestamptz not null default now()
);

comment on table public.spaces is 'Tenant raiz. Los datos de un space jamas se mezclan con otro: todo acceso se filtra por membresia via RLS.';

-- -----------------------------------------------------------------------------
-- SPACE_MEMBERS  (quien pertenece a que espacio y con que rol)
-- -----------------------------------------------------------------------------
create table if not exists public.space_members (
    id          uuid primary key default gen_random_uuid(),
    space_id    uuid not null references public.spaces(id) on delete cascade,
    user_id     uuid not null references public.profiles(id) on delete cascade,
    role        member_role not null default 'editor',
    invited_by  uuid references public.profiles(id),
    joined_at   timestamptz not null default now(),
    unique (space_id, user_id)
);

comment on table public.space_members is 'Relacion N:M usuario<->espacio con rol. Unica fuente de verdad para las politicas RLS del resto de tablas.';

-- -----------------------------------------------------------------------------
-- FUNCIONES HELPER DE AUTORIZACION (SECURITY DEFINER para evitar recursion
-- de RLS al consultar space_members desde las politicas de otras tablas)
-- -----------------------------------------------------------------------------
create or replace function public.is_space_member(p_space_id uuid)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
    select exists (
        select 1
        from public.space_members sm
        where sm.space_id = p_space_id
          and sm.user_id = auth.uid()
    );
$$;

create or replace function public.has_space_role(p_space_id uuid, p_roles member_role[])
returns boolean
language sql
security definer
stable
set search_path = public
as $$
    select exists (
        select 1
        from public.space_members sm
        where sm.space_id = p_space_id
          and sm.user_id = auth.uid()
          and sm.role = any(p_roles)
    );
$$;

revoke all on function public.is_space_member(uuid) from public;
revoke all on function public.has_space_role(uuid, member_role[]) from public;
grant execute on function public.is_space_member(uuid) to authenticated;
grant execute on function public.has_space_role(uuid, member_role[]) to authenticated;

-- -----------------------------------------------------------------------------
-- ACCOUNTS  (cuentas/billeteras dentro de un espacio; el saldo se calcula,
-- nunca lo escribe la IA directamente)
-- -----------------------------------------------------------------------------
create table if not exists public.accounts (
    id              uuid primary key default gen_random_uuid(),
    space_id        uuid not null references public.spaces(id) on delete cascade,
    name            text not null,
    type            account_type not null default 'bank',
    currency        char(3) not null,
    opening_balance numeric(18,2) not null default 0,
    is_active       boolean not null default true,
    created_by      uuid not null references public.profiles(id),
    created_at      timestamptz not null default now(),
    updated_at      timestamptz not null default now()
);

comment on table public.accounts is 'Cuentas/billeteras de un espacio. El saldo corriente se deriva de opening_balance + transacciones confirmadas (vista, no columna denormalizada).';

-- -----------------------------------------------------------------------------
-- CATEGORIES  (arbol de categorias por espacio; permite defaults globales
-- con space_id null, sembradas por el sistema)
-- -----------------------------------------------------------------------------
create table if not exists public.categories (
    id          uuid primary key default gen_random_uuid(),
    space_id    uuid references public.spaces(id) on delete cascade,  -- null = categoria global del sistema
    parent_id   uuid references public.categories(id) on delete set null,
    name        text not null,
    icon        text,
    color       text,
    kind        movement_type not null default 'expense', -- income | expense (transfer no usa categoria)
    is_system   boolean not null default false,
    created_at  timestamptz not null default now(),
    constraint chk_categories_kind_not_transfer check (kind <> 'transfer')
);

comment on table public.categories is 'Categorias por espacio. space_id NULL representa categorias globales del sistema visibles para todos.';

-- -----------------------------------------------------------------------------
-- RECEIPTS  (documentos: foto/PDF/audio/texto crudo). Entidad separada de
-- TRANSACTIONS: un documento respalda 0..N transacciones potenciales.
-- -----------------------------------------------------------------------------
create table if not exists public.receipts (
    id                      uuid primary key default gen_random_uuid(),
    space_id                uuid not null references public.spaces(id) on delete cascade,
    uploaded_by             uuid not null references public.profiles(id),
    kind                    document_kind not null default 'receipt',
    capture_source          capture_source not null,
    storage_path            text,                 -- ruta en Supabase Storage (bucket privado, URLs firmadas de corta duracion)
    mime_type               text,
    original_filename       text,
    raw_transcript          text,                 -- salida cruda de OCR / speech-to-text
    ai_extracted_data       jsonb,                 -- interpretacion estructurada de la IA (monto, fecha, comercio, items...)
    confidence_score        numeric(4,3) check (confidence_score is null or confidence_score between 0 and 1),
    status                  record_status not null default 'pending_confirmation',
    processing_error        text,
    created_at              timestamptz not null default now(),
    updated_at              timestamptz not null default now()
);

comment on table public.receipts is 'Documento fuente (foto/audio/texto/PDF). Guarda la interpretacion cruda de la IA por separado de la transaccion que finalmente confirme el usuario.';

-- -----------------------------------------------------------------------------
-- TRANSACTIONS  (el movimiento financiero real, siempre confirmado o
-- pendiente de confirmar por una persona)
-- -----------------------------------------------------------------------------
create table if not exists public.transactions (
    id                      uuid primary key default gen_random_uuid(),
    space_id                uuid not null references public.spaces(id) on delete cascade,
    type                    movement_type not null,

    account_id              uuid references public.accounts(id) on delete restrict,  -- nulo solo mientras status = pending_confirmation
    destination_account_id  uuid references public.accounts(id) on delete restrict,  -- solo para transfer
    category_id             uuid references public.categories(id) on delete set null, -- null para transfer

    description             text,
    transaction_date        timestamptz not null default now(),

    -- Multimoneda: se preserva el original y se calcula el valor en moneda base.
    amount_original         numeric(18,2) not null check (amount_original > 0),
    currency_original       char(3) not null,
    exchange_rate           numeric(18,8) not null default 1,
    amount_base             numeric(18,2) generated always as (round(amount_original * exchange_rate, 2)) stored,

    -- Trazabilidad de captura / confianza (motor de confianza)
    receipt_id              uuid references public.receipts(id) on delete set null,
    source                  capture_source not null default 'manual',
    status                  record_status not null default 'pending_confirmation',
    confidence_score        numeric(4,3) check (confidence_score is null or confidence_score between 0 and 1),
    ai_raw_interpretation   jsonb,   -- snapshot de lo que la IA propuso antes de cualquier correccion humana

    created_by              uuid not null references public.profiles(id),
    confirmed_by            uuid references public.profiles(id),
    confirmed_at            timestamptz,

    created_at              timestamptz not null default now(),
    updated_at              timestamptz not null default now(),

    -- Forma valida segun el tipo de movimiento (account_id puede ser nulo
    -- mientras la fila este pending_confirmation; ver chk_confirmed_is_complete).
    constraint chk_transfer_shape check (
        (type = 'transfer' and destination_account_id is distinct from account_id and category_id is null)
        or
        (type in ('income', 'expense') and destination_account_id is null)
    ),

    -- Una transaccion CONFIRMED siempre debe tener cuenta (y cuenta destino si es transfer).
    -- Antes de confirmar (pending_confirmation) puede llegar incompleta desde la IA.
    constraint chk_confirmed_is_complete check (
        status <> 'confirmed'
        or (account_id is not null and (type <> 'transfer' or destination_account_id is not null))
    )
);

comment on table public.transactions is 'Movimiento financiero real y confirmable. amount_base es columna generada: JAMAS se calcula en el LLM ni en el cliente.';

create index if not exists idx_transactions_space_date on public.transactions (space_id, transaction_date desc);
create index if not exists idx_transactions_account on public.transactions (account_id);
create index if not exists idx_transactions_status on public.transactions (space_id, status) where status = 'pending_confirmation';
create index if not exists idx_receipts_space_status on public.receipts (space_id, status);
create index if not exists idx_accounts_space on public.accounts (space_id);
create index if not exists idx_categories_space on public.categories (space_id);
create index if not exists idx_space_members_user on public.space_members (user_id);

-- -----------------------------------------------------------------------------
-- AUDIT_LOGS  (historial inmutable; nunca se sobrescribe el pasado)
-- -----------------------------------------------------------------------------
create table if not exists public.audit_logs (
    id          uuid primary key default gen_random_uuid(),
    space_id    uuid not null references public.spaces(id) on delete cascade,
    actor_id    uuid references public.profiles(id),
    entity_type text not null,      -- 'transaction' | 'receipt' | 'account' | 'category' | 'space_member' ...
    entity_id   uuid not null,
    action      text not null,      -- 'insert' | 'update' | 'delete'
    old_data    jsonb,
    new_data    jsonb,
    created_at  timestamptz not null default now()
);

comment on table public.audit_logs is 'Bitacora de auditoria append-only, poblada solo por triggers (security definer). Sin acceso de escritura directa desde el cliente.';

create index if not exists idx_audit_logs_space_entity on public.audit_logs (space_id, entity_type, entity_id);

-- =============================================================================
-- TRIGGERS (CREATE OR REPLACE TRIGGER: idempotente, Postgres 14+)
-- =============================================================================

-- updated_at automatico -------------------------------------------------------
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
    new.updated_at = now();
    return new;
end;
$$;

create or replace trigger trg_profiles_updated_at before update on public.profiles
    for each row execute function public.set_updated_at();
create or replace trigger trg_spaces_updated_at before update on public.spaces
    for each row execute function public.set_updated_at();
create or replace trigger trg_accounts_updated_at before update on public.accounts
    for each row execute function public.set_updated_at();
create or replace trigger trg_receipts_updated_at before update on public.receipts
    for each row execute function public.set_updated_at();
create or replace trigger trg_transactions_updated_at before update on public.transactions
    for each row execute function public.set_updated_at();

-- Alta automatica del owner como space_member al crear un espacio ------------
create or replace function public.handle_new_space()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
    insert into public.space_members (space_id, user_id, role)
    values (new.id, new.owner_id, 'owner');
    return new;
end;
$$;

create or replace trigger trg_spaces_after_insert after insert on public.spaces
    for each row execute function public.handle_new_space();

-- Integridad cruzada: account_id / destination_account_id / category_id /
-- receipt_id de una transaccion deben pertenecer al MISMO space_id -----------
create or replace function public.validate_transaction_space_consistency()
returns trigger
language plpgsql
as $$
declare
    v_account_space uuid;
    v_dest_space uuid;
    v_category_space uuid;
    v_receipt_space uuid;
begin
    if new.account_id is not null then
        select space_id into v_account_space from public.accounts where id = new.account_id;
        if v_account_space is distinct from new.space_id then
            raise exception 'account_id no pertenece al space_id de la transaccion';
        end if;
    end if;

    if new.destination_account_id is not null then
        select space_id into v_dest_space from public.accounts where id = new.destination_account_id;
        if v_dest_space is distinct from new.space_id then
            raise exception 'destination_account_id no pertenece al space_id de la transaccion';
        end if;
    end if;

    if new.category_id is not null then
        select space_id into v_category_space from public.categories where id = new.category_id;
        if v_category_space is not null and v_category_space is distinct from new.space_id then
            raise exception 'category_id no pertenece al space_id de la transaccion';
        end if;
    end if;

    if new.receipt_id is not null then
        select space_id into v_receipt_space from public.receipts where id = new.receipt_id;
        if v_receipt_space is distinct from new.space_id then
            raise exception 'receipt_id no pertenece al space_id de la transaccion';
        end if;
    end if;

    return new;
end;
$$;

create or replace trigger trg_transactions_validate_space before insert or update
    on public.transactions
    for each row execute function public.validate_transaction_space_consistency();

-- Auditoria append-only para transactions y accounts --------------------------
create or replace function public.write_audit_log()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
    v_space_id uuid;
begin
    v_space_id := coalesce(new.space_id, old.space_id);

    insert into public.audit_logs (space_id, actor_id, entity_type, entity_id, action, old_data, new_data)
    values (
        v_space_id,
        auth.uid(),
        tg_table_name,
        coalesce(new.id, old.id),
        lower(tg_op),
        case when tg_op in ('update', 'delete') then to_jsonb(old) else null end,
        case when tg_op in ('insert', 'update') then to_jsonb(new) else null end
    );

    return coalesce(new, old);
end;
$$;

create or replace trigger trg_transactions_audit after insert or update or delete
    on public.transactions
    for each row execute function public.write_audit_log();

create or replace trigger trg_accounts_audit after insert or update or delete
    on public.accounts
    for each row execute function public.write_audit_log();

create or replace trigger trg_receipts_audit after insert or update or delete
    on public.receipts
    for each row execute function public.write_audit_log();

-- =============================================================================
-- VISTA: saldo actual por cuenta (calculado, nunca almacenado directamente)
-- =============================================================================
create or replace view public.account_balances as
select
    a.id as account_id,
    a.space_id,
    a.name as account_name,
    a.type as account_type,
    a.currency as account_currency,
    a.is_active,
    a.opening_balance
        + coalesce(sum(case
            when t.type = 'income' and t.account_id = a.id then t.amount_base
            when t.type = 'expense' and t.account_id = a.id then -t.amount_base
            when t.type = 'transfer' and t.account_id = a.id then -t.amount_base
            when t.type = 'transfer' and t.destination_account_id = a.id then t.amount_base
            else 0
        end), 0) as current_balance,
    a.opening_balance
        + coalesce(sum(case
            when t.type = 'income' and t.account_id = a.id then t.amount_original
            when t.type = 'expense' and t.account_id = a.id then -t.amount_original
            when t.type = 'transfer' and t.account_id = a.id then -t.amount_original
            when t.type = 'transfer' and t.destination_account_id = a.id then t.amount_original
            else 0
        end), 0) as current_balance_original
from public.accounts a
left join public.transactions t
    on (t.account_id = a.id or t.destination_account_id = a.id)
    and t.status = 'confirmed'
group by a.id, a.space_id, a.name, a.type, a.currency, a.is_active, a.opening_balance;

comment on view public.account_balances is 'Saldo calculado deterministicamente por Postgres a partir de transacciones CONFIRMADAS. La IA nunca escribe este numero. current_balance esta en moneda base (via amount_base); current_balance_original es la suma cruda en la moneda propia de la cuenta.';

-- =============================================================================
-- ROW LEVEL SECURITY (idempotente: DROP POLICY IF EXISTS + CREATE POLICY,
-- porque Postgres no soporta CREATE POLICY IF NOT EXISTS)
-- =============================================================================
alter table public.profiles       enable row level security;
alter table public.spaces         enable row level security;
alter table public.space_members  enable row level security;
alter table public.accounts       enable row level security;
alter table public.categories     enable row level security;
alter table public.receipts       enable row level security;
alter table public.transactions   enable row level security;
alter table public.audit_logs     enable row level security;

-- PROFILES: cada usuario solo ve/edita su propio perfil ----------------------
drop policy if exists profiles_select_own on public.profiles;
create policy profiles_select_own on public.profiles
    for select using (id = auth.uid());
drop policy if exists profiles_update_own on public.profiles;
create policy profiles_update_own on public.profiles
    for update using (id = auth.uid());
drop policy if exists profiles_insert_own on public.profiles;
create policy profiles_insert_own on public.profiles
    for insert with check (id = auth.uid());

-- SPACES ----------------------------------------------------------------------
drop policy if exists spaces_select_member on public.spaces;
create policy spaces_select_member on public.spaces
    for select using (public.is_space_member(id));
drop policy if exists spaces_insert_any_authenticated on public.spaces;
create policy spaces_insert_any_authenticated on public.spaces
    for insert with check (owner_id = auth.uid());
drop policy if exists spaces_update_admin on public.spaces;
create policy spaces_update_admin on public.spaces
    for update using (public.has_space_role(id, array['owner','admin']::member_role[]));
drop policy if exists spaces_delete_owner on public.spaces;
create policy spaces_delete_owner on public.spaces
    for delete using (public.has_space_role(id, array['owner']::member_role[]));

-- SPACE_MEMBERS -----------------------------------------------------------------
drop policy if exists space_members_select_member on public.space_members;
create policy space_members_select_member on public.space_members
    for select using (public.is_space_member(space_id));
drop policy if exists space_members_insert_admin on public.space_members;
create policy space_members_insert_admin on public.space_members
    for insert with check (public.has_space_role(space_id, array['owner','admin']::member_role[]));
drop policy if exists space_members_update_admin on public.space_members;
create policy space_members_update_admin on public.space_members
    for update using (public.has_space_role(space_id, array['owner','admin']::member_role[]));
drop policy if exists space_members_delete_admin_or_self on public.space_members;
create policy space_members_delete_admin_or_self on public.space_members
    for delete using (
        public.has_space_role(space_id, array['owner','admin']::member_role[])
        or user_id = auth.uid()
    );

-- ACCOUNTS ----------------------------------------------------------------------
drop policy if exists accounts_select_member on public.accounts;
create policy accounts_select_member on public.accounts
    for select using (public.is_space_member(space_id));
drop policy if exists accounts_insert_editor on public.accounts;
create policy accounts_insert_editor on public.accounts
    for insert with check (public.has_space_role(space_id, array['owner','admin','editor']::member_role[]));
drop policy if exists accounts_update_editor on public.accounts;
create policy accounts_update_editor on public.accounts
    for update using (public.has_space_role(space_id, array['owner','admin','editor']::member_role[]));
drop policy if exists accounts_delete_admin on public.accounts;
create policy accounts_delete_admin on public.accounts
    for delete using (public.has_space_role(space_id, array['owner','admin']::member_role[]));

-- CATEGORIES ----------------------------------------------------------------------
drop policy if exists categories_select_member_or_global on public.categories;
create policy categories_select_member_or_global on public.categories
    for select using (space_id is null or public.is_space_member(space_id));
drop policy if exists categories_insert_editor on public.categories;
create policy categories_insert_editor on public.categories
    for insert with check (space_id is not null and public.has_space_role(space_id, array['owner','admin','editor']::member_role[]));
drop policy if exists categories_update_editor on public.categories;
create policy categories_update_editor on public.categories
    for update using (space_id is not null and public.has_space_role(space_id, array['owner','admin','editor']::member_role[]));
drop policy if exists categories_delete_admin on public.categories;
create policy categories_delete_admin on public.categories
    for delete using (space_id is not null and public.has_space_role(space_id, array['owner','admin']::member_role[]));

-- RECEIPTS ----------------------------------------------------------------------
drop policy if exists receipts_select_member on public.receipts;
create policy receipts_select_member on public.receipts
    for select using (public.is_space_member(space_id));
drop policy if exists receipts_insert_editor on public.receipts;
create policy receipts_insert_editor on public.receipts
    for insert with check (public.has_space_role(space_id, array['owner','admin','editor']::member_role[]));
drop policy if exists receipts_update_editor on public.receipts;
create policy receipts_update_editor on public.receipts
    for update using (public.has_space_role(space_id, array['owner','admin','editor']::member_role[]));
drop policy if exists receipts_delete_admin on public.receipts;
create policy receipts_delete_admin on public.receipts
    for delete using (public.has_space_role(space_id, array['owner','admin']::member_role[]));

-- TRANSACTIONS ----------------------------------------------------------------------
drop policy if exists transactions_select_member on public.transactions;
create policy transactions_select_member on public.transactions
    for select using (public.is_space_member(space_id));
drop policy if exists transactions_insert_editor on public.transactions;
create policy transactions_insert_editor on public.transactions
    for insert with check (public.has_space_role(space_id, array['owner','admin','editor']::member_role[]));
drop policy if exists transactions_update_editor on public.transactions;
create policy transactions_update_editor on public.transactions
    for update using (public.has_space_role(space_id, array['owner','admin','editor']::member_role[]));
drop policy if exists transactions_delete_admin on public.transactions;
create policy transactions_delete_admin on public.transactions
    for delete using (public.has_space_role(space_id, array['owner','admin']::member_role[]));

-- AUDIT_LOGS: solo lectura para miembros; ninguna politica de escritura, por lo
-- que INSERT/UPDATE/DELETE del cliente quedan bloqueados. Solo el trigger
-- (SECURITY DEFINER, corre como el dueno de la funcion) puede insertar. -------
drop policy if exists audit_logs_select_member on public.audit_logs;
create policy audit_logs_select_member on public.audit_logs
    for select using (public.is_space_member(space_id));

-- =============================================================================
-- SEED MINIMO: categorias globales del sistema (space_id null)
-- Indice unico parcial + ON CONFLICT para poder reinsertar sin duplicar.
-- =============================================================================
create unique index if not exists idx_categories_system_name_unique
    on public.categories (name) where space_id is null;

insert into public.categories (space_id, parent_id, name, icon, kind, is_system) values
    (null, null, 'Alimentacion', 'utensils', 'expense', true),
    (null, null, 'Transporte', 'car', 'expense', true),
    (null, null, 'Vivienda', 'home', 'expense', true),
    (null, null, 'Salud', 'heart-pulse', 'expense', true),
    (null, null, 'Entretenimiento', 'film', 'expense', true),
    (null, null, 'Educacion', 'book', 'expense', true),
    (null, null, 'Otros gastos', 'more-horizontal', 'expense', true),
    (null, null, 'Salario', 'wallet', 'income', true),
    (null, null, 'Ingresos independientes', 'briefcase', 'income', true),
    (null, null, 'Otros ingresos', 'plus-circle', 'income', true)
on conflict (name) where space_id is null do nothing;

-- =============================================================================
-- 0002_receipts_storage_bucket.sql
-- Bucket privado para documentos fuente (fotos/PDF) + RLS por espacio.
--
-- Convencion de ruta obligatoria: <space_id>/<archivo>
-- El primer segmento de la ruta se usa como space_id para autorizar via
-- is_space_member/has_space_role, igual que en el resto del esquema.
-- =============================================================================

insert into storage.buckets (id, name, public)
values ('receipts', 'receipts', false)
on conflict (id) do nothing;

drop policy if exists "receipts_storage_insert_editor" on storage.objects;
create policy "receipts_storage_insert_editor" on storage.objects
    for insert to authenticated
    with check (
        bucket_id = 'receipts'
        and public.has_space_role(((storage.foldername(name))[1])::uuid, array['owner','admin','editor']::member_role[])
    );

drop policy if exists "receipts_storage_select_member" on storage.objects;
create policy "receipts_storage_select_member" on storage.objects
    for select to authenticated
    using (
        bucket_id = 'receipts'
        and public.is_space_member(((storage.foldername(name))[1])::uuid)
    );

drop policy if exists "receipts_storage_delete_admin" on storage.objects;
create policy "receipts_storage_delete_admin" on storage.objects
    for delete to authenticated
    using (
        bucket_id = 'receipts'
        and public.has_space_role(((storage.foldername(name))[1])::uuid, array['owner','admin']::member_role[])
    );

-- =============================================================================
-- 0003_handle_new_user.sql
-- Al registrarse en Supabase Auth, se crea automaticamente:
--   1. La fila en public.profiles (id = auth.users.id).
--   2. Un "Espacio Personal" con el nuevo usuario como owner.
-- El trigger trg_spaces_after_insert (arriba) ya agrega la membresia owner
-- cuando se inserta el espacio, asi que no hay que duplicar esa logica aqui.
-- =============================================================================

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
    v_full_name text;
begin
    v_full_name := new.raw_user_meta_data ->> 'full_name';

    insert into public.profiles (id, email, full_name, privacy_consent_at, terms_accepted_at)
    values (new.id, new.email, v_full_name, now(), now())
    on conflict (id) do nothing;

    insert into public.spaces (name, type, base_currency, owner_id)
    values ('Espacio Personal', 'personal', 'COP', new.id);

    return new;
end;
$$;

create or replace trigger trg_auth_users_after_insert
    after insert on auth.users
    for each row execute function public.handle_new_user();

-- =============================================================================
-- 0004_shared_space_profile_visibility.sql
-- /settings necesita listar el nombre/correo de los miembros del espacio.
-- La policy original de profiles solo permite "ver mi propio perfil"
-- (correcto para el caso general), asi que se agrega una policy adicional
-- (las policies del mismo comando se combinan con OR) que expone unicamente
-- el perfil de alguien con quien el usuario ya comparte al menos un espacio.
-- Nunca se abre profiles globalmente.
-- =============================================================================

create or replace function public.shares_any_space_with(p_user_id uuid)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
    select exists (
        select 1
        from public.space_members my
        join public.space_members theirs on theirs.space_id = my.space_id
        where my.user_id = auth.uid()
          and theirs.user_id = p_user_id
    );
$$;

revoke all on function public.shares_any_space_with(uuid) from public;
grant execute on function public.shares_any_space_with(uuid) to authenticated;

drop policy if exists profiles_select_shared_space on public.profiles;
create policy profiles_select_shared_space on public.profiles
    for select using (public.shares_any_space_with(id));

-- =============================================================================
-- 0005_system_logs.sql
-- Destino $0 para telemetria de errores (reemplaza a un proveedor de correo
-- de pago): solo accesible via service_role, sin policies para
-- authenticated/anon.
-- =============================================================================

create table if not exists public.system_logs (
    id          uuid primary key default gen_random_uuid(),
    source      text not null,
    message     text not null,
    stack       text,
    digest      text,
    context     jsonb,
    created_at  timestamptz not null default now()
);

comment on table public.system_logs is 'Logs de errores/telemetria del sistema (no de un usuario). Solo accesible via service_role — sin policies para authenticated/anon.';

create index if not exists idx_system_logs_created_at on public.system_logs (created_at desc);
create index if not exists idx_system_logs_source on public.system_logs (source);

alter table public.system_logs enable row level security;

-- 0006: por si system_logs quedo creada antes con menos columnas
-- ("create table if not exists" no altera una tabla ya existente).
alter table public.system_logs add column if not exists stack text;
alter table public.system_logs add column if not exists digest text;
alter table public.system_logs add column if not exists context jsonb;

-- 0007: clarificacion interactiva de la IA (aprendizajes por espacio) ---------
create table if not exists public.classification_hints (
    id          uuid primary key default gen_random_uuid(),
    space_id    uuid not null references public.spaces(id) on delete cascade,
    question    text not null,
    answer      text not null,
    created_by  uuid not null references public.profiles(id),
    created_at  timestamptz not null default now()
);

comment on table public.classification_hints is 'Aprendizajes de clarificaciones pregunta->respuesta por espacio. Se inyectan como contexto en el prompt de extraccion para que la IA aplique el mismo criterio sin repreguntar.';

create index if not exists idx_classification_hints_space on public.classification_hints (space_id, created_at desc);

alter table public.classification_hints enable row level security;

drop policy if exists classification_hints_select_member on public.classification_hints;
create policy classification_hints_select_member on public.classification_hints
    for select using (public.is_space_member(space_id));

drop policy if exists classification_hints_insert_editor on public.classification_hints;
create policy classification_hints_insert_editor on public.classification_hints
    for insert with check (public.has_space_role(space_id, array['owner','admin','editor']::member_role[]));

drop policy if exists classification_hints_delete_admin on public.classification_hints;
create policy classification_hints_delete_admin on public.classification_hints
    for delete using (public.has_space_role(space_id, array['owner','admin']::member_role[]));

-- 0008: modelo de datos de planes Gratis/Pro/Premium (sin cobro real) ---------
create table if not exists public.subscriptions (
    id                   uuid primary key default gen_random_uuid(),
    user_id              uuid not null unique references public.profiles(id) on delete cascade,
    plan                 text not null default 'free' check (plan in ('free', 'pro', 'premium')),
    status               text not null default 'active' check (status in ('active', 'inactive', 'canceled')),
    max_spaces           integer,
    max_monthly_records  integer,
    max_storage_mb       integer,
    activated_by         uuid references public.profiles(id),
    notes                text,
    started_at           timestamptz not null default now(),
    updated_at           timestamptz not null default now()
);

comment on table public.subscriptions is 'Plan Gratis/Pro/Premium por usuario. GARANTIA DE RETENCION: cambiar status a inactive/canceled NUNCA borra ni oculta datos historicos. Limites max_* en NULL hasta definir numeros concretos.';

create index if not exists idx_subscriptions_user on public.subscriptions (user_id);

drop trigger if exists trg_subscriptions_updated_at on public.subscriptions;
create trigger trg_subscriptions_updated_at before update on public.subscriptions
    for each row execute function public.set_updated_at();

alter table public.subscriptions enable row level security;

drop policy if exists subscriptions_select_own on public.subscriptions;
create policy subscriptions_select_own on public.subscriptions
    for select using (user_id = auth.uid());

insert into public.subscriptions (user_id, plan, status)
select id, 'free', 'active' from public.profiles
on conflict (user_id) do nothing;

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
    v_full_name text;
begin
    v_full_name := new.raw_user_meta_data ->> 'full_name';

    insert into public.profiles (id, email, full_name, privacy_consent_at, terms_accepted_at)
    values (new.id, new.email, v_full_name, now(), now())
    on conflict (id) do nothing;

    insert into public.spaces (name, type, base_currency, owner_id)
    values ('Espacio Personal', 'personal', 'COP', new.id);

    insert into public.subscriptions (user_id, plan, status)
    values (new.id, 'free', 'active')
    on conflict (user_id) do nothing;

    return new;
end;
$$;

-- 0009: alinear system_logs con columnas agregadas fuera de las migraciones
-- (level NOT NULL sin default hacia fallar reportError() en silencio) -------
alter table public.system_logs add column if not exists level text not null default 'error';
alter table public.system_logs alter column level set default 'error';
alter table public.system_logs add column if not exists user_id uuid references public.profiles(id) on delete set null;
alter table public.system_logs add column if not exists space_id uuid references public.spaces(id) on delete set null;

commit;
