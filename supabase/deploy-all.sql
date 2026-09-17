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

-- 0010: etiquetas de subproyecto por transaccion ------------------------------
alter table public.transactions add column if not exists tags text[] not null default '{}';
create index if not exists idx_transactions_tags on public.transactions using gin (tags);

-- 0011: consentimiento explicito de TyC/Habeas Data (no auto-fijado) ----------
update public.profiles set privacy_consent_at = null, terms_accepted_at = null;

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

    insert into public.profiles (id, email, full_name)
    values (new.id, new.email, v_full_name)
    on conflict (id) do nothing;

    insert into public.spaces (name, type, base_currency, owner_id)
    values ('Espacio Personal', 'personal', 'COP', new.id);

    insert into public.subscriptions (user_id, plan, status)
    values (new.id, 'free', 'active')
    on conflict (user_id) do nothing;

    return new;
end;
$$;

-- 0012: cuenta por defecto en cada espacio (nunca dejar el selector vacio) --
insert into public.accounts (space_id, name, type, currency, created_by)
select s.id, 'Efectivo', 'cash', s.base_currency, s.owner_id
from public.spaces s
where not exists (select 1 from public.accounts a where a.space_id = s.id);

create or replace function public.handle_new_space()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
    insert into public.space_members (space_id, user_id, role)
    values (new.id, new.owner_id, 'owner');

    insert into public.accounts (space_id, name, type, currency, created_by)
    values (new.id, 'Efectivo', 'cash', new.base_currency, new.owner_id);

    return new;
end;
$$;

-- 0013: Modo Fantasma -- profiles.email nullable para inicio de sesion
-- anonimo (requiere ademas habilitar "Anonymous Sign-Ins" en Supabase
-- Dashboard -> Authentication -> Sign In / Providers; no activable por SQL) --
alter table public.profiles alter column email drop not null;

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
    v_full_name text;
begin
    v_full_name := coalesce(new.raw_user_meta_data ->> 'full_name', case when new.email is null then 'Invitado' else null end);

    insert into public.profiles (id, email, full_name)
    values (new.id, new.email, v_full_name)
    on conflict (id) do nothing;

    insert into public.spaces (name, type, base_currency, owner_id)
    values ('Espacio Personal', 'personal', 'COP', new.id);

    insert into public.subscriptions (user_id, plan, status)
    values (new.id, 'free', 'active')
    on conflict (user_id) do nothing;

    return new;
end;
$$;

-- 0014: naturaleza Personal/Negocio por transaccion (Inteligencia para Microemprendimientos) --
alter table public.transactions add column if not exists is_business boolean not null default false;

drop index if exists idx_transactions_business;
create index idx_transactions_business on public.transactions (space_id, is_business) where is_business;

-- 0015: is_pro por espacio (monetizacion) + Realtime en transactions (espacios colaborativos) --
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

-- 0016: carpetas contextuales Personal/Familiar/Salud (Negocio ya lo cubre is_business) --
alter table public.transactions
    add column if not exists life_domain text;

alter table public.transactions
    drop constraint if exists chk_transactions_life_domain;

alter table public.transactions
    add constraint chk_transactions_life_domain check (life_domain is null or life_domain in ('personal', 'familiar', 'salud'));

-- 0017: modulo de facturas/obligaciones con fecha limite (alertas de vencimiento) --
create table if not exists public.bills (
    id           uuid primary key default gen_random_uuid(),
    space_id     uuid not null references public.spaces(id) on delete cascade,
    description  text not null,
    amount       numeric(18,2) not null check (amount > 0),
    currency     char(3) not null default 'COP',
    due_date     date not null,
    status       text not null default 'pending' check (status in ('pending', 'paid')),
    created_by   uuid not null references public.profiles(id),
    created_at   timestamptz not null default now(),
    paid_at      timestamptz
);

create index if not exists idx_bills_space_due on public.bills (space_id, due_date) where status = 'pending';

alter table public.bills enable row level security;

drop policy if exists bills_select_member on public.bills;
create policy bills_select_member on public.bills
    for select using (public.is_space_member(space_id));

drop policy if exists bills_insert_editor on public.bills;
create policy bills_insert_editor on public.bills
    for insert with check (public.has_space_role(space_id, array['owner','admin','editor']::member_role[]));

drop policy if exists bills_update_editor on public.bills;
create policy bills_update_editor on public.bills
    for update using (public.has_space_role(space_id, array['owner','admin','editor']::member_role[]));

drop policy if exists bills_delete_admin on public.bills;
create policy bills_delete_admin on public.bills
    for delete using (public.has_space_role(space_id, array['owner','admin']::member_role[]));

-- 0018: snapshot atomico del tablero (RPC) + cuenta default sin condicion de carrera + CHECK negocio/dominio --
create or replace function public.get_executive_board_snapshot(p_space_id uuid)
returns jsonb
language sql
stable
security invoker
set search_path = public
as $$
  select jsonb_build_object(
    'space', (
      select jsonb_build_object('base_currency', s.base_currency)
      from spaces s
      where s.id = p_space_id
    ),
    'accounts', coalesce((
      select jsonb_agg(jsonb_build_object(
        'account_id', ab.account_id,
        'space_id', ab.space_id,
        'name', ab.account_name,
        'type', ab.account_type,
        'currency', ab.account_currency,
        'is_active', ab.is_active,
        'current_balance', ab.current_balance,
        'current_balance_original', ab.current_balance_original,
        'opening_balance', a.opening_balance
      ) order by ab.account_name)
      from account_balances ab
      join accounts a on a.id = ab.account_id
      where ab.space_id = p_space_id
    ), '[]'::jsonb),
    'pending_transactions', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', t.id,
        'type', t.type,
        'status', t.status,
        'source', t.source,
        'description', t.description,
        'amount_original', t.amount_original,
        'currency_original', t.currency_original,
        'confidence_score', t.confidence_score,
        'ai_raw_interpretation', t.ai_raw_interpretation,
        'account_id', t.account_id,
        'category_id', t.category_id,
        'transaction_date', t.transaction_date,
        'receipt_id', t.receipt_id,
        'created_at', t.created_at,
        'tags', t.tags,
        'is_business', t.is_business,
        'life_domain', t.life_domain
      ) order by t.created_at desc)
      from transactions t
      where t.space_id = p_space_id and t.status = 'pending_confirmation'
    ), '[]'::jsonb),
    'categories', coalesce((
      select jsonb_agg(jsonb_build_object('id', c.id, 'name', c.name, 'kind', c.kind, 'is_system', c.is_system) order by c.kind, c.name)
      from categories c
      where c.space_id = p_space_id or c.space_id is null
    ), '[]'::jsonb),
    'members', coalesce((
      select jsonb_agg(jsonb_build_object(
        'user_id', sm.user_id, 'role', sm.role, 'joined_at', sm.joined_at,
        'email', p.email, 'full_name', p.full_name
      ) order by sm.joined_at)
      from space_members sm
      join profiles p on p.id = sm.user_id
      where sm.space_id = p_space_id
    ), '[]'::jsonb),
    'recent_activity', coalesce((
      select jsonb_agg(row_json order by row_date desc) from (
        select
          jsonb_build_object(
            'id', t.id, 'type', t.type, 'description', t.description,
            'amount_original', t.amount_original, 'currency_original', t.currency_original,
            'transaction_date', t.transaction_date, 'tags', t.tags,
            'category_id', t.category_id, 'category_name', c.name
          ) as row_json,
          t.transaction_date as row_date
        from transactions t
        left join categories c on c.id = t.category_id
        where t.space_id = p_space_id and t.status = 'confirmed'
        order by t.transaction_date desc
        limit 5
      ) recent
    ), '[]'::jsonb),
    'bills', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', b.id, 'description', b.description, 'amount', b.amount,
        'currency', b.currency, 'due_date', b.due_date
      ) order by b.due_date)
      from bills b
      where b.space_id = p_space_id and b.status = 'pending'
    ), '[]'::jsonb),
    'monthly_net_flow', coalesce((
      select sum(case when t.type = 'income' then t.amount_base when t.type = 'expense' then -t.amount_base else 0 end)
      from transactions t
      where t.space_id = p_space_id and t.status = 'confirmed'
        and t.transaction_date >= date_trunc('month', timezone('utc', now()))
    ), 0),
    'yearly_overview', coalesce((
      select jsonb_agg(jsonb_build_object(
        'year', y.yr, 'total_income', y.total_income, 'total_expense', y.total_expense,
        'net_flow', y.total_income - y.total_expense
      ) order by y.yr desc)
      from (
        select
          extract(year from timezone('utc', t.transaction_date))::int as yr,
          sum(case when t.type = 'income' then t.amount_base else 0 end) as total_income,
          sum(case when t.type = 'expense' then t.amount_base else 0 end) as total_expense
        from transactions t
        where t.space_id = p_space_id and t.status = 'confirmed'
        group by 1
      ) y
    ), '[]'::jsonb),
    'today_activity_dates', coalesce((
      select jsonb_agg(t.transaction_date)
      from transactions t
      where t.space_id = p_space_id
        and t.transaction_date >= date_trunc('day', timezone('utc', now()))
    ), '[]'::jsonb),
    'pattern_rows', coalesce((
      select jsonb_agg(jsonb_build_object(
        'description', t.description, 'amount_original', t.amount_original,
        'type', t.type, 'transaction_date', t.transaction_date
      ) order by t.transaction_date asc)
      from transactions t
      where t.space_id = p_space_id and t.status = 'confirmed'
        and t.transaction_date >= (timezone('utc', now()) - interval '12 months')
    ), '[]'::jsonb),
    'business_rows', coalesce((
      select jsonb_agg(jsonb_build_object(
        'type', t.type, 'amount_base', t.amount_base, 'transaction_date', t.transaction_date
      ) order by t.transaction_date asc)
      from transactions t
      where t.space_id = p_space_id and t.status = 'confirmed' and t.is_business = true
        and t.transaction_date >= (timezone('utc', now()) - interval '120 days')
    ), '[]'::jsonb)
  )
$$;

revoke all on function public.get_executive_board_snapshot(uuid) from public;
grant execute on function public.get_executive_board_snapshot(uuid) to authenticated;

do $$
begin
    if not exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'accounts' and column_name = 'is_default_account') then
        alter table public.accounts add column is_default_account boolean not null default false;
    end if;
end $$;

with ranked as (
    select id, row_number() over (partition by space_id order by created_at asc) as rn
    from public.accounts
    where is_active = true
)
update public.accounts a
set is_default_account = true
from ranked r
where a.id = r.id and r.rn = 1 and a.is_default_account = false;

create unique index if not exists idx_accounts_one_default_per_space on public.accounts (space_id) where is_default_account;

create or replace function public.get_or_create_default_account(p_space_id uuid, p_user_id uuid, p_currency char(3))
returns uuid
language plpgsql
security invoker
set search_path = public
as $$
declare
    v_account_id uuid;
begin
    select id into v_account_id
    from public.accounts
    where space_id = p_space_id and is_active = true
    order by created_at asc
    limit 1;

    if v_account_id is not null then
        return v_account_id;
    end if;

    insert into public.accounts (space_id, name, type, currency, created_by, is_default_account)
    values (p_space_id, 'Efectivo', 'cash', p_currency, p_user_id, true)
    on conflict (space_id) where (is_default_account) do nothing
    returning id into v_account_id;

    if v_account_id is not null then
        return v_account_id;
    end if;

    select id into v_account_id
    from public.accounts
    where space_id = p_space_id and is_default_account = true
    limit 1;

    return v_account_id;
end;
$$;

revoke all on function public.get_or_create_default_account(uuid, uuid, char(3)) from public;
grant execute on function public.get_or_create_default_account(uuid, uuid, char(3)) to authenticated;

update public.transactions set life_domain = null where is_business = true and life_domain is not null;

do $$
begin
    if not exists (select 1 from pg_constraint where conname = 'chk_transactions_business_domain') then
        alter table public.transactions
            add constraint chk_transactions_business_domain check (is_business = false or life_domain is null);
    end if;
end $$;

-- 0019: ingresos recurrentes con ajuste anual (pension/salario) + folder en recent_activity --
create table if not exists public.recurring_incomes (
    id                        uuid primary key default gen_random_uuid(),
    space_id                  uuid not null references public.spaces(id) on delete cascade,
    description               text not null,
    amount                    numeric(18,2) not null check (amount > 0),
    currency                  char(3) not null default 'COP',
    is_business               boolean not null default false,
    life_domain               text check (life_domain is null or life_domain in ('personal', 'familiar', 'salud')),
    annual_adjustment_percent numeric(5,2) check (annual_adjustment_percent is null or annual_adjustment_percent between -100 and 100),
    adjustment_month          smallint not null default 1 check (adjustment_month between 1 and 12),
    is_active                 boolean not null default true,
    last_generated_period     date,
    last_adjusted_year        int,
    created_by                uuid not null references public.profiles(id),
    created_at                timestamptz not null default now(),
    updated_at                timestamptz not null default now(),
    constraint chk_recurring_incomes_business_domain check (is_business = false or life_domain is null)
);

create index if not exists idx_recurring_incomes_space on public.recurring_incomes (space_id) where is_active;

drop trigger if exists trg_recurring_incomes_updated_at on public.recurring_incomes;
create trigger trg_recurring_incomes_updated_at before update on public.recurring_incomes
    for each row execute function public.set_updated_at();

alter table public.recurring_incomes enable row level security;

drop policy if exists recurring_incomes_select_member on public.recurring_incomes;
create policy recurring_incomes_select_member on public.recurring_incomes
    for select using (public.is_space_member(space_id));

drop policy if exists recurring_incomes_insert_editor on public.recurring_incomes;
create policy recurring_incomes_insert_editor on public.recurring_incomes
    for insert with check (public.has_space_role(space_id, array['owner','admin','editor']::member_role[]));

drop policy if exists recurring_incomes_update_editor on public.recurring_incomes;
create policy recurring_incomes_update_editor on public.recurring_incomes
    for update using (public.has_space_role(space_id, array['owner','admin','editor']::member_role[]));

drop policy if exists recurring_incomes_delete_admin on public.recurring_incomes;
create policy recurring_incomes_delete_admin on public.recurring_incomes
    for delete using (public.has_space_role(space_id, array['owner','admin']::member_role[]));

create or replace function public.generate_due_recurring_incomes(p_space_id uuid)
returns int
language plpgsql
security invoker
set search_path = public
as $$
declare
    v_row record;
    v_current_month date := date_trunc('month', timezone('utc', now()))::date;
    v_current_year int := extract(year from timezone('utc', now()))::int;
    v_current_month_num int := extract(month from timezone('utc', now()))::int;
    v_amount numeric(18,2);
    v_should_adjust boolean;
    v_generated int := 0;
begin
    for v_row in
        select * from public.recurring_incomes
        where space_id = p_space_id
          and is_active = true
          and (last_generated_period is null or last_generated_period < v_current_month)
        for update skip locked
    loop
        v_amount := v_row.amount;
        v_should_adjust := v_row.annual_adjustment_percent is not null
            and v_current_month_num >= v_row.adjustment_month
            and (v_row.last_adjusted_year is null or v_row.last_adjusted_year < v_current_year);

        if v_should_adjust then
            v_amount := round(v_amount * (1 + v_row.annual_adjustment_percent / 100), 2);
        end if;

        insert into public.transactions (
            space_id, type, amount_original, currency_original, exchange_rate,
            source, status, description, transaction_date, is_business, life_domain,
            ai_raw_interpretation, created_by
        ) values (
            p_space_id, 'income', v_amount, v_row.currency, 1,
            'manual', 'pending_confirmation', v_row.description, timezone('utc', now()),
            v_row.is_business, v_row.life_domain,
            jsonb_build_object('recurring_income_id', v_row.id, 'recurring_income', true),
            v_row.created_by
        );

        update public.recurring_incomes
        set amount = v_amount,
            last_generated_period = v_current_month,
            last_adjusted_year = case when v_should_adjust then v_current_year else last_adjusted_year end
        where id = v_row.id;

        v_generated := v_generated + 1;
    end loop;

    return v_generated;
end;
$$;

revoke all on function public.generate_due_recurring_incomes(uuid) from public;
grant execute on function public.generate_due_recurring_incomes(uuid) to authenticated;

create or replace function public.get_executive_board_snapshot(p_space_id uuid)
returns jsonb
language sql
stable
security invoker
set search_path = public
as $$
  select jsonb_build_object(
    'space', (
      select jsonb_build_object('base_currency', s.base_currency)
      from spaces s
      where s.id = p_space_id
    ),
    'accounts', coalesce((
      select jsonb_agg(jsonb_build_object(
        'account_id', ab.account_id,
        'space_id', ab.space_id,
        'name', ab.account_name,
        'type', ab.account_type,
        'currency', ab.account_currency,
        'is_active', ab.is_active,
        'current_balance', ab.current_balance,
        'current_balance_original', ab.current_balance_original,
        'opening_balance', a.opening_balance
      ) order by ab.account_name)
      from account_balances ab
      join accounts a on a.id = ab.account_id
      where ab.space_id = p_space_id
    ), '[]'::jsonb),
    'pending_transactions', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', t.id,
        'type', t.type,
        'status', t.status,
        'source', t.source,
        'description', t.description,
        'amount_original', t.amount_original,
        'currency_original', t.currency_original,
        'confidence_score', t.confidence_score,
        'ai_raw_interpretation', t.ai_raw_interpretation,
        'account_id', t.account_id,
        'category_id', t.category_id,
        'transaction_date', t.transaction_date,
        'receipt_id', t.receipt_id,
        'created_at', t.created_at,
        'tags', t.tags,
        'is_business', t.is_business,
        'life_domain', t.life_domain
      ) order by t.created_at desc)
      from transactions t
      where t.space_id = p_space_id and t.status = 'pending_confirmation'
    ), '[]'::jsonb),
    'categories', coalesce((
      select jsonb_agg(jsonb_build_object('id', c.id, 'name', c.name, 'kind', c.kind, 'is_system', c.is_system) order by c.kind, c.name)
      from categories c
      where c.space_id = p_space_id or c.space_id is null
    ), '[]'::jsonb),
    'members', coalesce((
      select jsonb_agg(jsonb_build_object(
        'user_id', sm.user_id, 'role', sm.role, 'joined_at', sm.joined_at,
        'email', p.email, 'full_name', p.full_name
      ) order by sm.joined_at)
      from space_members sm
      join profiles p on p.id = sm.user_id
      where sm.space_id = p_space_id
    ), '[]'::jsonb),
    'recent_activity', coalesce((
      select jsonb_agg(row_json order by row_date desc) from (
        select
          jsonb_build_object(
            'id', t.id, 'type', t.type, 'description', t.description,
            'amount_original', t.amount_original, 'currency_original', t.currency_original,
            'transaction_date', t.transaction_date, 'tags', t.tags,
            'category_id', t.category_id, 'category_name', c.name,
            'is_business', t.is_business, 'life_domain', t.life_domain
          ) as row_json,
          t.transaction_date as row_date
        from transactions t
        left join categories c on c.id = t.category_id
        where t.space_id = p_space_id and t.status = 'confirmed'
        order by t.transaction_date desc
        limit 5
      ) recent
    ), '[]'::jsonb),
    'bills', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', b.id, 'description', b.description, 'amount', b.amount,
        'currency', b.currency, 'due_date', b.due_date
      ) order by b.due_date)
      from bills b
      where b.space_id = p_space_id and b.status = 'pending'
    ), '[]'::jsonb),
    'monthly_net_flow', coalesce((
      select sum(case when t.type = 'income' then t.amount_base when t.type = 'expense' then -t.amount_base else 0 end)
      from transactions t
      where t.space_id = p_space_id and t.status = 'confirmed'
        and t.transaction_date >= date_trunc('month', timezone('utc', now()))
    ), 0),
    'yearly_overview', coalesce((
      select jsonb_agg(jsonb_build_object(
        'year', y.yr, 'total_income', y.total_income, 'total_expense', y.total_expense,
        'net_flow', y.total_income - y.total_expense
      ) order by y.yr desc)
      from (
        select
          extract(year from timezone('utc', t.transaction_date))::int as yr,
          sum(case when t.type = 'income' then t.amount_base else 0 end) as total_income,
          sum(case when t.type = 'expense' then t.amount_base else 0 end) as total_expense
        from transactions t
        where t.space_id = p_space_id and t.status = 'confirmed'
        group by 1
      ) y
    ), '[]'::jsonb),
    'today_activity_dates', coalesce((
      select jsonb_agg(t.transaction_date)
      from transactions t
      where t.space_id = p_space_id
        and t.transaction_date >= date_trunc('day', timezone('utc', now()))
    ), '[]'::jsonb),
    'pattern_rows', coalesce((
      select jsonb_agg(jsonb_build_object(
        'description', t.description, 'amount_original', t.amount_original,
        'type', t.type, 'transaction_date', t.transaction_date
      ) order by t.transaction_date asc)
      from transactions t
      where t.space_id = p_space_id and t.status = 'confirmed'
        and t.transaction_date >= (timezone('utc', now()) - interval '12 months')
    ), '[]'::jsonb),
    'business_rows', coalesce((
      select jsonb_agg(jsonb_build_object(
        'type', t.type, 'amount_base', t.amount_base, 'transaction_date', t.transaction_date
      ) order by t.transaction_date asc)
      from transactions t
      where t.space_id = p_space_id and t.status = 'confirmed' and t.is_business = true
        and t.transaction_date >= (timezone('utc', now()) - interval '120 days')
    ), '[]'::jsonb),
    'recurring_incomes', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', ri.id, 'description', ri.description, 'amount', ri.amount, 'currency', ri.currency,
        'is_business', ri.is_business, 'life_domain', ri.life_domain,
        'annual_adjustment_percent', ri.annual_adjustment_percent, 'adjustment_month', ri.adjustment_month,
        'is_active', ri.is_active, 'last_generated_period', ri.last_generated_period
      ) order by ri.created_at asc)
      from recurring_incomes ri
      where ri.space_id = p_space_id
    ), '[]'::jsonb)
  )
$$;

revoke all on function public.get_executive_board_snapshot(uuid) from public;
grant execute on function public.get_executive_board_snapshot(uuid) to authenticated;

-- 0020: relaja llaves foraneas hacia profiles(id) a ON DELETE SET NULL para soportar Eliminar Cuenta y Datos --
do $$
declare
    v_pair record;
    v_conname text;
begin
    for v_pair in
        select * from (values
            ('accounts', 'created_by'),
            ('receipts', 'uploaded_by'),
            ('transactions', 'created_by'),
            ('transactions', 'confirmed_by'),
            ('audit_logs', 'actor_id'),
            ('classification_hints', 'created_by'),
            ('bills', 'created_by'),
            ('recurring_incomes', 'created_by'),
            ('space_members', 'invited_by'),
            ('subscriptions', 'activated_by')
        ) as t(tbl, col)
    loop
        execute format('alter table public.%I alter column %I drop not null', v_pair.tbl, v_pair.col);

        select con.conname into v_conname
        from pg_constraint con
        where con.conrelid = format('public.%I', v_pair.tbl)::regclass
          and con.confrelid = 'public.profiles'::regclass
          and con.contype = 'f'
          and con.conkey = array(
              select attnum from pg_attribute
              where attrelid = format('public.%I', v_pair.tbl)::regclass and attname = v_pair.col
          );

        if v_conname is not null then
            execute format('alter table public.%I drop constraint %I', v_pair.tbl, v_conname);
        end if;

        execute format(
            'alter table public.%I add constraint %I foreign key (%I) references public.profiles(id) on delete set null',
            v_pair.tbl, v_pair.tbl || '_' || v_pair.col || '_fkey', v_pair.col
        );
    end loop;
end $$;

-- 0021: corrige violacion de llave foranea en audit_logs al borrar un espacio con datos --
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

    if not exists (select 1 from public.spaces where id = v_space_id) then
        return coalesce(new, old);
    end if;

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

-- 0022: bill_reminder_days configurable por espacio (antes fijo en 3 dias) --
do $$
begin
    if not exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'spaces' and column_name = 'bill_reminder_days') then
        alter table public.spaces
            add column bill_reminder_days smallint not null default 3 check (bill_reminder_days between 1 and 30);
    end if;
end $$;

-- 0023: founder access -- pamela31leiva@gmail.com y @30.com quedan is_pro=true en todos sus espacios --
do $$
begin
    if not exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'profiles' and column_name = 'is_founder_access') then
        alter table public.profiles add column is_founder_access boolean not null default false;
    end if;
end $$;

update public.profiles
set is_founder_access = true
where email = 'pamela31leiva@gmail.com' or email ilike '%@30.com';

update public.spaces s
set is_pro = true
from public.profiles p
where s.owner_id = p.id and p.is_founder_access = true and s.is_pro = false;

create or replace function public.apply_founder_pro_default()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
    if exists (select 1 from public.profiles where id = new.owner_id and is_founder_access = true) then
        new.is_pro := true;
    end if;
    return new;
end;
$$;

drop trigger if exists trg_spaces_founder_pro_default on public.spaces;
create trigger trg_spaces_founder_pro_default before insert on public.spaces
    for each row execute function public.apply_founder_pro_default();

create or replace function public.apply_founder_pro_on_profile_update()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
    if new.is_founder_access = true and old.is_founder_access is distinct from true then
        update public.spaces set is_pro = true where owner_id = new.id and is_pro = false;
    end if;
    return new;
end;
$$;

drop trigger if exists trg_profiles_founder_pro_sync on public.profiles;
create trigger trg_profiles_founder_pro_sync after update on public.profiles
    for each row execute function public.apply_founder_pro_on_profile_update();

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
    v_full_name text;
    v_is_founder boolean;
begin
    v_full_name := new.raw_user_meta_data ->> 'full_name';
    v_is_founder := (new.email = 'pamela31leiva@gmail.com' or new.email ilike '%@30.com');

    insert into public.profiles (id, email, full_name, privacy_consent_at, terms_accepted_at, is_founder_access)
    values (new.id, new.email, v_full_name, now(), now(), v_is_founder)
    on conflict (id) do nothing;

    insert into public.spaces (name, type, base_currency, owner_id)
    values ('Espacio Personal', 'personal', 'COP', new.id);

    return new;
end;
$$;

-- 0023 (cont.): snapshot amplia con folder_distribution/weekday_heat (Radiografia Proporcional) y anomalies (nivel avanzado) --
create or replace function public.get_executive_board_snapshot(p_space_id uuid)
returns jsonb
language sql
stable
security invoker
set search_path = public
as $$
  select jsonb_build_object(
    'space', (
      select jsonb_build_object('base_currency', s.base_currency)
      from spaces s
      where s.id = p_space_id
    ),
    'accounts', coalesce((
      select jsonb_agg(jsonb_build_object(
        'account_id', ab.account_id,
        'space_id', ab.space_id,
        'name', ab.account_name,
        'type', ab.account_type,
        'currency', ab.account_currency,
        'is_active', ab.is_active,
        'current_balance', ab.current_balance,
        'current_balance_original', ab.current_balance_original,
        'opening_balance', a.opening_balance
      ) order by ab.account_name)
      from account_balances ab
      join accounts a on a.id = ab.account_id
      where ab.space_id = p_space_id
    ), '[]'::jsonb),
    'pending_transactions', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', t.id,
        'type', t.type,
        'status', t.status,
        'source', t.source,
        'description', t.description,
        'amount_original', t.amount_original,
        'currency_original', t.currency_original,
        'confidence_score', t.confidence_score,
        'ai_raw_interpretation', t.ai_raw_interpretation,
        'account_id', t.account_id,
        'category_id', t.category_id,
        'transaction_date', t.transaction_date,
        'receipt_id', t.receipt_id,
        'created_at', t.created_at,
        'tags', t.tags,
        'is_business', t.is_business,
        'life_domain', t.life_domain
      ) order by t.created_at desc)
      from transactions t
      where t.space_id = p_space_id and t.status = 'pending_confirmation'
    ), '[]'::jsonb),
    'categories', coalesce((
      select jsonb_agg(jsonb_build_object('id', c.id, 'name', c.name, 'kind', c.kind, 'is_system', c.is_system) order by c.kind, c.name)
      from categories c
      where c.space_id = p_space_id or c.space_id is null
    ), '[]'::jsonb),
    'members', coalesce((
      select jsonb_agg(jsonb_build_object(
        'user_id', sm.user_id, 'role', sm.role, 'joined_at', sm.joined_at,
        'email', p.email, 'full_name', p.full_name
      ) order by sm.joined_at)
      from space_members sm
      join profiles p on p.id = sm.user_id
      where sm.space_id = p_space_id
    ), '[]'::jsonb),
    'recent_activity', coalesce((
      select jsonb_agg(row_json order by row_date desc) from (
        select
          jsonb_build_object(
            'id', t.id, 'type', t.type, 'description', t.description,
            'amount_original', t.amount_original, 'currency_original', t.currency_original,
            'transaction_date', t.transaction_date, 'tags', t.tags,
            'category_id', t.category_id, 'category_name', c.name,
            'is_business', t.is_business, 'life_domain', t.life_domain
          ) as row_json,
          t.transaction_date as row_date
        from transactions t
        left join categories c on c.id = t.category_id
        where t.space_id = p_space_id and t.status = 'confirmed'
        order by t.transaction_date desc
        limit 5
      ) recent
    ), '[]'::jsonb),
    'bills', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', b.id, 'description', b.description, 'amount', b.amount,
        'currency', b.currency, 'due_date', b.due_date
      ) order by b.due_date)
      from bills b
      where b.space_id = p_space_id and b.status = 'pending'
    ), '[]'::jsonb),
    'monthly_net_flow', coalesce((
      select sum(case when t.type = 'income' then t.amount_base when t.type = 'expense' then -t.amount_base else 0 end)
      from transactions t
      where t.space_id = p_space_id and t.status = 'confirmed'
        and t.transaction_date >= date_trunc('month', timezone('utc', now()))
    ), 0),
    'yearly_overview', coalesce((
      select jsonb_agg(jsonb_build_object(
        'year', y.yr, 'total_income', y.total_income, 'total_expense', y.total_expense,
        'net_flow', y.total_income - y.total_expense
      ) order by y.yr desc)
      from (
        select
          extract(year from timezone('utc', t.transaction_date))::int as yr,
          sum(case when t.type = 'income' then t.amount_base else 0 end) as total_income,
          sum(case when t.type = 'expense' then t.amount_base else 0 end) as total_expense
        from transactions t
        where t.space_id = p_space_id and t.status = 'confirmed'
        group by 1
      ) y
    ), '[]'::jsonb),
    'today_activity_dates', coalesce((
      select jsonb_agg(t.transaction_date)
      from transactions t
      where t.space_id = p_space_id
        and t.transaction_date >= date_trunc('day', timezone('utc', now()))
    ), '[]'::jsonb),
    'pattern_rows', coalesce((
      select jsonb_agg(jsonb_build_object(
        'description', t.description, 'amount_original', t.amount_original,
        'type', t.type, 'transaction_date', t.transaction_date
      ) order by t.transaction_date asc)
      from transactions t
      where t.space_id = p_space_id and t.status = 'confirmed'
        and t.transaction_date >= (timezone('utc', now()) - interval '12 months')
    ), '[]'::jsonb),
    'business_rows', coalesce((
      select jsonb_agg(jsonb_build_object(
        'type', t.type, 'amount_base', t.amount_base, 'transaction_date', t.transaction_date
      ) order by t.transaction_date asc)
      from transactions t
      where t.space_id = p_space_id and t.status = 'confirmed' and t.is_business = true
        and t.transaction_date >= (timezone('utc', now()) - interval '120 days')
    ), '[]'::jsonb),
    'recurring_incomes', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', ri.id, 'description', ri.description, 'amount', ri.amount, 'currency', ri.currency,
        'is_business', ri.is_business, 'life_domain', ri.life_domain,
        'annual_adjustment_percent', ri.annual_adjustment_percent, 'adjustment_month', ri.adjustment_month,
        'is_active', ri.is_active, 'last_generated_period', ri.last_generated_period
      ) order by ri.created_at asc)
      from recurring_incomes ri
      where ri.space_id = p_space_id
    ), '[]'::jsonb),
    'folder_distribution', coalesce((
      select jsonb_agg(jsonb_build_object(
        'is_business', d.is_business, 'life_domain', d.life_domain, 'total', d.total
      ) order by d.total desc)
      from (
        select is_business, life_domain, sum(amount_base) as total
        from transactions
        where space_id = p_space_id and status = 'confirmed' and type = 'expense'
          and transaction_date >= date_trunc('month', timezone('utc', now()))
        group by is_business, life_domain
      ) d
    ), '[]'::jsonb),
    'weekday_heat', coalesce((
      select jsonb_agg(jsonb_build_object('weekday', h.wd, 'total', h.total) order by h.wd)
      from (
        select extract(dow from timezone('utc', transaction_date))::int as wd, sum(amount_base) as total
        from transactions
        where space_id = p_space_id and status = 'confirmed' and type = 'expense'
          and transaction_date >= (timezone('utc', now()) - interval '90 days')
        group by 1
      ) h
    ), '[]'::jsonb),
    'anomalies', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', t.id, 'description', t.description, 'amount_base', t.amount_base,
        'category_name', c.name, 'transaction_date', t.transaction_date,
        'category_avg', round(stats.avg_amount, 2)
      ) order by t.amount_base desc)
      from transactions t
      join categories c on c.id = t.category_id
      join (
        select category_id, avg(amount_base) as avg_amount
        from transactions
        where space_id = p_space_id and status = 'confirmed' and type = 'expense' and category_id is not null
          and transaction_date >= (timezone('utc', now()) - interval '90 days')
        group by category_id
        having count(*) >= 4
      ) stats on stats.category_id = t.category_id
      where t.space_id = p_space_id and t.status = 'confirmed' and t.type = 'expense'
        and t.transaction_date >= (timezone('utc', now()) - interval '90 days')
        and t.amount_base > stats.avg_amount * 2.5
      limit 10
    ), '[]'::jsonb)
  )
$$;

revoke all on function public.get_executive_board_snapshot(uuid) from public;
grant execute on function public.get_executive_board_snapshot(uuid) to authenticated;

-- 0024: create_space RPC atomica -- corrige "No se pudo crear el espacio" (RETURNING vs politica de SELECT por membresia) --
create or replace function public.create_space(p_name text, p_type space_type, p_base_currency char(3) default 'COP')
returns table (id uuid, name text, type space_type, base_currency char(3), is_pro boolean)
language plpgsql
security definer
set search_path = public
as $$
declare
    v_user_id uuid := auth.uid();
    v_trimmed_name text := trim(p_name);
    v_space_id uuid;
begin
    if v_user_id is null then
        raise exception 'No autorizado';
    end if;
    if v_trimmed_name = '' then
        raise exception 'El espacio necesita un nombre.';
    end if;

    insert into public.spaces (name, type, base_currency, owner_id)
    values (v_trimmed_name, p_type, coalesce(p_base_currency, 'COP'), v_user_id)
    returning spaces.id into v_space_id;

    return query select s.id, s.name, s.type, s.base_currency, s.is_pro from public.spaces s where s.id = v_space_id;
end;
$$;

revoke all on function public.create_space(text, space_type, char) from public;
grant execute on function public.create_space(text, space_type, char) to authenticated;

-- 0025: import_batches + huellas de fila en transactions (idempotencia de BulkImportModal) --
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

-- 0026: bills.receipt_id + capture_source 'xml_invoice' (facturacion electronica DIAN, XML UBL) --
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

-- 0027: inbound_channels (Bandeja Automatica) + merchant_rules (categorizacion automatica por comercio) --
create table if not exists public.inbound_channels (
    id            uuid primary key default gen_random_uuid(),
    space_id      uuid not null references public.spaces(id) on delete cascade,
    label         text not null default 'Canal automatico',
    token_hash    text not null unique,
    created_by    uuid not null references public.profiles(id),
    is_active     boolean not null default true,
    last_used_at  timestamptz,
    created_at    timestamptz not null default now()
);

comment on table public.inbound_channels is 'Tokens secretos (solo hash) para que un sistema externo suba documentos a este espacio via /api/inbound/documents, sin sesion de usuario.';

create index if not exists idx_inbound_channels_space on public.inbound_channels (space_id);

alter table public.inbound_channels enable row level security;

drop policy if exists inbound_channels_select_member on public.inbound_channels;
create policy inbound_channels_select_member on public.inbound_channels
    for select using (public.is_space_member(space_id));
drop policy if exists inbound_channels_insert_admin on public.inbound_channels;
create policy inbound_channels_insert_admin on public.inbound_channels
    for insert with check (public.has_space_role(space_id, array['owner','admin']::member_role[]));
drop policy if exists inbound_channels_update_admin on public.inbound_channels;
create policy inbound_channels_update_admin on public.inbound_channels
    for update using (public.has_space_role(space_id, array['owner','admin']::member_role[]));
drop policy if exists inbound_channels_delete_admin on public.inbound_channels;
create policy inbound_channels_delete_admin on public.inbound_channels
    for delete using (public.has_space_role(space_id, array['owner','admin']::member_role[]));

create table if not exists public.merchant_rules (
    id            uuid primary key default gen_random_uuid(),
    space_id      uuid not null references public.spaces(id) on delete cascade,
    pattern       text not null,
    category_id   uuid references public.categories(id) on delete set null,
    account_id    uuid references public.accounts(id) on delete set null,
    tags          text[] not null default '{}',
    folder        text check (folder is null or folder in ('personal', 'familiar', 'salud', 'negocio')),
    is_active     boolean not null default true,
    created_by    uuid not null references public.profiles(id),
    created_at    timestamptz not null default now(),
    updated_at    timestamptz not null default now(),
    constraint chk_merchant_rules_pattern_not_empty check (length(trim(pattern)) > 0)
);

comment on table public.merchant_rules is 'Regla por comercio: si la descripcion de una captura nueva contiene "pattern" (case-insensitive), se aplican automaticamente categoria/cuenta/etiquetas/carpeta -- reduce la correccion manual sin saltarse pending_confirmation.';

create index if not exists idx_merchant_rules_space on public.merchant_rules (space_id) where is_active;

drop trigger if exists trg_merchant_rules_updated_at on public.merchant_rules;
create trigger trg_merchant_rules_updated_at before update on public.merchant_rules
    for each row execute function public.set_updated_at();

alter table public.merchant_rules enable row level security;

drop policy if exists merchant_rules_select_member on public.merchant_rules;
create policy merchant_rules_select_member on public.merchant_rules
    for select using (public.is_space_member(space_id));
drop policy if exists merchant_rules_insert_editor on public.merchant_rules;
create policy merchant_rules_insert_editor on public.merchant_rules
    for insert with check (public.has_space_role(space_id, array['owner','admin','editor']::member_role[]));
drop policy if exists merchant_rules_update_editor on public.merchant_rules;
create policy merchant_rules_update_editor on public.merchant_rules
    for update using (public.has_space_role(space_id, array['owner','admin','editor']::member_role[]));
drop policy if exists merchant_rules_delete_admin on public.merchant_rules;
create policy merchant_rules_delete_admin on public.merchant_rules
    for delete using (public.has_space_role(space_id, array['owner','admin']::member_role[]));

-- 0028: budgets + get_financial_history + get_monthly_report + indice de rendimiento para transferencias --
create index if not exists idx_transactions_destination_account on public.transactions (destination_account_id) where destination_account_id is not null;

create table if not exists public.budgets (
    id             uuid primary key default gen_random_uuid(),
    space_id       uuid not null references public.spaces(id) on delete cascade,
    category_id    uuid not null references public.categories(id) on delete cascade,
    monthly_amount numeric(18,2) not null check (monthly_amount > 0),
    created_by     uuid not null references public.profiles(id),
    created_at     timestamptz not null default now(),
    updated_at     timestamptz not null default now(),
    unique (space_id, category_id)
);

comment on table public.budgets is 'Presupuesto mensual fijo por categoria de gasto (sin arrastre entre meses) -- usado por get_monthly_report para calcular cumplimiento.';

drop trigger if exists trg_budgets_updated_at on public.budgets;
create trigger trg_budgets_updated_at before update on public.budgets
    for each row execute function public.set_updated_at();

alter table public.budgets enable row level security;

drop policy if exists budgets_select_member on public.budgets;
create policy budgets_select_member on public.budgets
    for select using (public.is_space_member(space_id));
drop policy if exists budgets_insert_editor on public.budgets;
create policy budgets_insert_editor on public.budgets
    for insert with check (public.has_space_role(space_id, array['owner','admin','editor']::member_role[]));
drop policy if exists budgets_update_editor on public.budgets;
create policy budgets_update_editor on public.budgets
    for update using (public.has_space_role(space_id, array['owner','admin','editor']::member_role[]));
drop policy if exists budgets_delete_admin on public.budgets;
create policy budgets_delete_admin on public.budgets
    for delete using (public.has_space_role(space_id, array['owner','admin']::member_role[]));

create or replace function public.get_financial_history(p_space_id uuid, p_periods int default 12)
returns table (
    period_start date,
    assets       numeric,
    liabilities  numeric,
    net_worth    numeric,
    income       numeric,
    expense      numeric
)
language sql
stable
security invoker
set search_path = public
as $$
    with requested_months as (
        select (date_trunc('month', timezone('utc', now())) - (interval '1 month' * gs))::date as period_start
        from generate_series(0, greatest(p_periods - 1, 0)) as gs
    ),
    earliest_txn_month as (
        select date_trunc('month', min(transaction_date))::date as m
        from public.transactions
        where space_id = p_space_id and status = 'confirmed'
    ),
    series_start as (
        select least(
            (select min(period_start) from requested_months),
            coalesce((select m from earliest_txn_month), (select min(period_start) from requested_months))
        ) as m
    ),
    all_months as (
        select generate_series((select m from series_start), (select max(period_start) from requested_months), interval '1 month')::date as period_start
    ),
    account_month_deltas as (
        select
            a.id as account_id,
            a.type as account_type,
            a.opening_balance,
            am.period_start,
            coalesce(sum(case
                when t.type = 'income' and t.account_id = a.id then t.amount_base
                when t.type = 'expense' and t.account_id = a.id then -t.amount_base
                when t.type = 'transfer' and t.account_id = a.id then -t.amount_base
                when t.type = 'transfer' and t.destination_account_id = a.id then t.amount_base
                else 0
            end), 0) as delta
        from all_months am
        cross join public.accounts a
        left join public.transactions t
            on (t.account_id = a.id or t.destination_account_id = a.id)
            and t.status = 'confirmed'
            and date_trunc('month', t.transaction_date) = am.period_start
        where a.space_id = p_space_id
        group by a.id, a.type, a.opening_balance, am.period_start
    ),
    account_month_balances as (
        select
            account_id,
            account_type,
            period_start,
            opening_balance + sum(delta) over (partition by account_id order by period_start) as cumulative_balance
        from account_month_deltas
    ),
    period_totals as (
        select
            period_start,
            coalesce(sum(cumulative_balance) filter (where account_type <> 'credit_card'), 0) as assets,
            coalesce(-sum(cumulative_balance) filter (where account_type = 'credit_card' and cumulative_balance < 0), 0) as liabilities,
            coalesce(sum(cumulative_balance), 0) as net_worth
        from account_month_balances
        group by period_start
    ),
    month_flows as (
        select
            date_trunc('month', t.transaction_date)::date as period_start,
            coalesce(sum(case when t.type = 'income' then t.amount_base else 0 end), 0) as income,
            coalesce(sum(case when t.type = 'expense' then t.amount_base else 0 end), 0) as expense
        from public.transactions t
        where t.space_id = p_space_id and t.status = 'confirmed'
        group by 1
    )
    select
        rm.period_start,
        coalesce(pt.assets, 0) as assets,
        coalesce(pt.liabilities, 0) as liabilities,
        coalesce(pt.net_worth, 0) as net_worth,
        coalesce(mf.income, 0) as income,
        coalesce(mf.expense, 0) as expense
    from requested_months rm
    left join period_totals pt on pt.period_start = rm.period_start
    left join month_flows mf on mf.period_start = rm.period_start
    order by rm.period_start asc;
$$;

revoke all on function public.get_financial_history(uuid, int) from public;
grant execute on function public.get_financial_history(uuid, int) to authenticated;

create or replace function public.get_monthly_report(p_space_id uuid, p_month date default date_trunc('month', timezone('utc', now()))::date)
returns jsonb
language sql
stable
security invoker
set search_path = public
as $$
    with bounds as (
        select
            date_trunc('month', p_month)::date as month_start,
            (date_trunc('month', p_month) + interval '1 month' - interval '1 day')::date as month_end
    ),
    month_txns as (
        select t.*
        from public.transactions t, bounds b
        where t.space_id = p_space_id and t.status = 'confirmed'
          and t.transaction_date >= b.month_start and t.transaction_date <= b.month_end
    ),
    totals as (
        select
            coalesce(sum(case when type = 'income' then amount_base else 0 end), 0) as total_income,
            coalesce(sum(case when type = 'expense' then amount_base else 0 end), 0) as total_expense
        from month_txns
    ),
    category_breakdown as (
        select
            c.id as category_id,
            c.name as category_name,
            coalesce(sum(mt.amount_base), 0) as total,
            bu.monthly_amount as budget_amount
        from public.categories c
        left join month_txns mt on mt.category_id = c.id and mt.type = 'expense'
        left join public.budgets bu on bu.category_id = c.id and bu.space_id = p_space_id
        where (c.space_id = p_space_id or c.space_id is null) and c.kind = 'expense'
        group by c.id, c.name, bu.monthly_amount
        having coalesce(sum(mt.amount_base), 0) > 0 or bu.monthly_amount is not null
    )
    select jsonb_build_object(
        'month_start', (select month_start from bounds),
        'month_end', (select month_end from bounds),
        'total_income', (select total_income from totals),
        'total_expense', (select total_expense from totals),
        'net_flow', (select total_income - total_expense from totals),
        'category_breakdown', coalesce((
            select jsonb_agg(jsonb_build_object(
                'category_id', category_id,
                'category_name', category_name,
                'total', total,
                'budget_amount', budget_amount
            ) order by total desc)
            from category_breakdown
        ), '[]'::jsonb)
    )
$$;

revoke all on function public.get_monthly_report(uuid, date) from public;
grant execute on function public.get_monthly_report(uuid, date) to authenticated;

-- 0029: trigger que impide dejar un espacio sin ningun propietario --
create or replace function public.prevent_ownerless_space()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
    v_remaining_owners int;
begin
    if old.role <> 'owner' then
        return coalesce(new, old);
    end if;
    if TG_OP = 'UPDATE' and new.role = 'owner' then
        return new;
    end if;

    if TG_OP = 'DELETE' and not exists (select 1 from public.spaces where id = old.space_id) then
        return old;
    end if;

    select count(*) into v_remaining_owners
    from public.space_members
    where space_id = old.space_id and role = 'owner' and id <> old.id;

    if v_remaining_owners = 0 then
        raise exception 'Un espacio siempre debe tener al menos un propietario. Asigna otro owner antes de continuar.';
    end if;

    return coalesce(new, old);
end;
$$;

comment on function public.prevent_ownerless_space() is 'Bloquea el update/delete que dejaria un espacio sin ningun miembro role=owner -- cierra un hueco de space_members_update_admin (0001), que por lo demas sigue intacta.';

drop trigger if exists trg_prevent_ownerless_space on public.space_members;
create trigger trg_prevent_ownerless_space
    before update or delete on public.space_members
    for each row execute function public.prevent_ownerless_space();

-- 0030: category_fiscal_tags + transactions.withholding_tax_amount + get_fiscal_summary --
create table if not exists public.category_fiscal_tags (
    id             uuid primary key default gen_random_uuid(),
    space_id       uuid not null references public.spaces(id) on delete cascade,
    category_id    uuid not null references public.categories(id) on delete cascade,
    tax_treatment  text not null check (tax_treatment in ('gravado', 'exento', 'no_gravado', 'deducible', 'no_deducible')),
    created_by     uuid not null references public.profiles(id),
    created_at     timestamptz not null default now(),
    updated_at     timestamptz not null default now(),
    unique (space_id, category_id)
);

comment on table public.category_fiscal_tags is 'Clasificacion fiscal que UN ESPACIO le da a una categoria (global o propia) -- gravado/exento/no_gravado (ingresos) o deducible/no_deducible (gastos). La persona la asigna; Postgres solo suma, nunca interpreta ni calcula impuesto.';

create index if not exists idx_category_fiscal_tags_space on public.category_fiscal_tags (space_id);

drop trigger if exists trg_category_fiscal_tags_updated_at on public.category_fiscal_tags;
create trigger trg_category_fiscal_tags_updated_at before update on public.category_fiscal_tags
    for each row execute function public.set_updated_at();

alter table public.category_fiscal_tags enable row level security;

drop policy if exists category_fiscal_tags_select_member on public.category_fiscal_tags;
create policy category_fiscal_tags_select_member on public.category_fiscal_tags
    for select using (public.is_space_member(space_id));
drop policy if exists category_fiscal_tags_insert_editor on public.category_fiscal_tags;
create policy category_fiscal_tags_insert_editor on public.category_fiscal_tags
    for insert with check (public.has_space_role(space_id, array['owner','admin','editor']::member_role[]));
drop policy if exists category_fiscal_tags_update_editor on public.category_fiscal_tags;
create policy category_fiscal_tags_update_editor on public.category_fiscal_tags
    for update using (public.has_space_role(space_id, array['owner','admin','editor']::member_role[]));
drop policy if exists category_fiscal_tags_delete_admin on public.category_fiscal_tags;
create policy category_fiscal_tags_delete_admin on public.category_fiscal_tags
    for delete using (public.has_space_role(space_id, array['owner','admin']::member_role[]));

do $$
begin
    if not exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'transactions' and column_name = 'withholding_tax_amount') then
        alter table public.transactions add column withholding_tax_amount numeric(18,2) check (withholding_tax_amount is null or withholding_tax_amount >= 0);
    end if;
end $$;

comment on column public.transactions.withholding_tax_amount is 'Retencion en la fuente que el pagador practico sobre ESTE movimiento (opcional, la declara la persona) -- no se calcula ni se infiere.';

create or replace function public.get_fiscal_summary(p_space_id uuid, p_year int default extract(year from timezone('utc', now()))::int)
returns jsonb
language sql
stable
security invoker
set search_path = public
as $$
    with year_txns as (
        select
            t.type,
            t.amount_base,
            t.withholding_tax_amount,
            extract(month from timezone('utc', t.transaction_date))::int as month,
            cft.tax_treatment
        from public.transactions t
        left join public.category_fiscal_tags cft
            on cft.category_id = t.category_id and cft.space_id = t.space_id
        where t.space_id = p_space_id
          and t.status = 'confirmed'
          and t.type in ('income', 'expense')
          and extract(year from timezone('utc', t.transaction_date)) = p_year
    ),
    totals as (
        select
            coalesce(sum(amount_base) filter (where type = 'income' and tax_treatment = 'gravado'), 0) as income_gravado,
            coalesce(sum(amount_base) filter (where type = 'income' and tax_treatment = 'exento'), 0) as income_exento,
            coalesce(sum(amount_base) filter (where type = 'income' and tax_treatment = 'no_gravado'), 0) as income_no_gravado,
            coalesce(sum(amount_base) filter (where type = 'income' and tax_treatment is null), 0) as income_unclassified,
            coalesce(sum(amount_base) filter (where type = 'expense' and tax_treatment = 'deducible'), 0) as expense_deducible,
            coalesce(sum(amount_base) filter (where type = 'expense' and tax_treatment = 'no_deducible'), 0) as expense_no_deducible,
            coalesce(sum(amount_base) filter (where type = 'expense' and tax_treatment is null), 0) as expense_unclassified,
            coalesce(sum(withholding_tax_amount), 0) as withholding_tax_total
        from year_txns
    ),
    monthly as (
        select
            month,
            coalesce(sum(amount_base) filter (where type = 'income' and tax_treatment = 'gravado'), 0) as income_gravado,
            coalesce(sum(amount_base) filter (where type = 'income' and tax_treatment = 'exento'), 0) as income_exento,
            coalesce(sum(amount_base) filter (where type = 'income' and tax_treatment = 'no_gravado'), 0) as income_no_gravado,
            coalesce(sum(amount_base) filter (where type = 'expense' and tax_treatment = 'deducible'), 0) as expense_deducible,
            coalesce(sum(amount_base) filter (where type = 'expense' and tax_treatment = 'no_deducible'), 0) as expense_no_deducible,
            coalesce(sum(withholding_tax_amount), 0) as withholding_tax_total
        from year_txns
        group by month
    )
    select jsonb_build_object(
        'year', p_year,
        'income_gravado', (select income_gravado from totals),
        'income_exento', (select income_exento from totals),
        'income_no_gravado', (select income_no_gravado from totals),
        'income_unclassified', (select income_unclassified from totals),
        'expense_deducible', (select expense_deducible from totals),
        'expense_no_deducible', (select expense_no_deducible from totals),
        'expense_unclassified', (select expense_unclassified from totals),
        'withholding_tax_total', (select withholding_tax_total from totals),
        'monthly', coalesce((
            select jsonb_agg(jsonb_build_object(
                'month', month,
                'income_gravado', income_gravado,
                'income_exento', income_exento,
                'income_no_gravado', income_no_gravado,
                'expense_deducible', expense_deducible,
                'expense_no_deducible', expense_no_deducible,
                'withholding_tax_total', withholding_tax_total
            ) order by month)
            from monthly
        ), '[]'::jsonb)
    )
$$;

revoke all on function public.get_fiscal_summary(uuid, int) from public;
grant execute on function public.get_fiscal_summary(uuid, int) to authenticated;

-- 0031: space_notification_channels + bills.reminder_sent_at + bill_reminder_days permite 0 --
create table if not exists public.space_notification_channels (
    id            uuid primary key default gen_random_uuid(),
    space_id      uuid not null references public.spaces(id) on delete cascade,
    channel_type  text not null check (channel_type in ('webhook', 'telegram')),
    config        jsonb not null,
    is_active     boolean not null default true,
    created_by    uuid not null references public.profiles(id),
    created_at    timestamptz not null default now(),
    updated_at    timestamptz not null default now()
);

comment on table public.space_notification_channels is 'Canales de salida (webhook generico o Telegram) para avisos proactivos de facturas por vencer -- config guarda credenciales en claro (se necesitan para enviar), por eso el acceso es owner/admin en toda operacion, mas estricto que el resto del esquema.';

create index if not exists idx_space_notification_channels_space on public.space_notification_channels (space_id) where is_active;

drop trigger if exists trg_space_notification_channels_updated_at on public.space_notification_channels;
create trigger trg_space_notification_channels_updated_at before update on public.space_notification_channels
    for each row execute function public.set_updated_at();

alter table public.space_notification_channels enable row level security;

drop policy if exists space_notification_channels_select_admin on public.space_notification_channels;
create policy space_notification_channels_select_admin on public.space_notification_channels
    for select using (public.has_space_role(space_id, array['owner','admin']::member_role[]));
drop policy if exists space_notification_channels_insert_admin on public.space_notification_channels;
create policy space_notification_channels_insert_admin on public.space_notification_channels
    for insert with check (public.has_space_role(space_id, array['owner','admin']::member_role[]));
drop policy if exists space_notification_channels_update_admin on public.space_notification_channels;
create policy space_notification_channels_update_admin on public.space_notification_channels
    for update using (public.has_space_role(space_id, array['owner','admin']::member_role[]));
drop policy if exists space_notification_channels_delete_admin on public.space_notification_channels;
create policy space_notification_channels_delete_admin on public.space_notification_channels
    for delete using (public.has_space_role(space_id, array['owner','admin']::member_role[]));

do $$
begin
    if not exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'bills' and column_name = 'reminder_sent_at') then
        alter table public.bills add column reminder_sent_at timestamptz;
    end if;
end $$;

comment on column public.bills.reminder_sent_at is 'Cuando se envio el aviso proactivo (webhook/Telegram) de esta factura -- null hasta entonces. Un aviso por factura, no uno por cada corrida del cron.';

alter table public.spaces drop constraint if exists spaces_bill_reminder_days_check;
alter table public.spaces add constraint spaces_bill_reminder_days_check check (bill_reminder_days between 0 and 30);


-- 0032: exchange_rates (cache de tasas) + alternative_assets (inversiones/cripto/bienes) + budgets multimoneda --
-- -----------------------------------------------------------------------------
-- EXCHANGE_RATES (cache de tasas historicas/actuales, compartida entre spaces)
-- -----------------------------------------------------------------------------
create table if not exists public.exchange_rates (
    id              uuid primary key default gen_random_uuid(),
    from_currency   char(3) not null,
    to_currency     char(3) not null,
    rate_date       date not null,
    rate            numeric(24,10) not null check (rate > 0),
    source          text not null default 'open.er-api.com',
    fetched_at      timestamptz not null default now(),
    unique (from_currency, to_currency, rate_date)
);

comment on table public.exchange_rates is 'Cache de tasas de cambio (historicas y actuales). rate convierte de from_currency a to_currency: monto_to = monto_from * rate. Se escribe solo desde el servidor (service role); el cliente unicamente lee.';

create index if not exists idx_exchange_rates_lookup on public.exchange_rates (from_currency, to_currency, rate_date desc);

alter table public.exchange_rates enable row level security;

drop policy if exists exchange_rates_select_authenticated on public.exchange_rates;
create policy exchange_rates_select_authenticated on public.exchange_rates
    for select using (auth.role() = 'authenticated');

-- -----------------------------------------------------------------------------
-- ALTERNATIVE_ASSETS (inversiones, cripto, bienes patrimoniales alternativos)
-- -----------------------------------------------------------------------------
do $$
begin
    if not exists (select 1 from pg_type where typname = 'alternative_asset_type') then
        create type public.alternative_asset_type as enum ('crypto', 'stock', 'real_estate', 'vehicle', 'other');
    end if;
end $$;

create table if not exists public.alternative_assets (
    id              uuid primary key default gen_random_uuid(),
    space_id        uuid not null references public.spaces(id) on delete cascade,
    name            text not null,
    asset_type      public.alternative_asset_type not null default 'other',
    currency        char(3) not null,
    -- quantity*unit_value en vez de un solo "valor actual": para cripto/acciones
    -- la persona conoce cuanto TIENE (0.05 BTC) y cuanto VALE la unidad hoy por
    -- separado -- forzar un solo numero perderia esa trazabilidad. Para un bien
    -- de valor unico (una casa) quantity simplemente se deja en 1.
    quantity        numeric(24,8) not null default 1 check (quantity > 0),
    unit_value      numeric(18,2) not null check (unit_value >= 0),
    current_value   numeric(18,2) generated always as (round(quantity * unit_value, 2)) stored,
    valuation_date  date not null default current_date,
    notes           text,
    is_active       boolean not null default true,
    created_by      uuid not null references public.profiles(id),
    created_at      timestamptz not null default now(),
    updated_at      timestamptz not null default now()
);

comment on table public.alternative_assets is 'Inversiones, criptoactivos y bienes patrimoniales alternativos de un espacio. current_value es columna generada (quantity*unit_value): la persona declara cantidad y valor unitario, Postgres calcula el total, nunca el LLM.';

create index if not exists idx_alternative_assets_space on public.alternative_assets (space_id);

drop trigger if exists trg_alternative_assets_updated_at on public.alternative_assets;
create trigger trg_alternative_assets_updated_at before update on public.alternative_assets
    for each row execute function public.set_updated_at();

drop trigger if exists trg_alternative_assets_audit on public.alternative_assets;
create trigger trg_alternative_assets_audit after insert or update or delete
    on public.alternative_assets
    for each row execute function public.write_audit_log();

alter table public.alternative_assets enable row level security;

drop policy if exists alternative_assets_select_member on public.alternative_assets;
create policy alternative_assets_select_member on public.alternative_assets
    for select using (public.is_space_member(space_id));
drop policy if exists alternative_assets_insert_editor on public.alternative_assets;
create policy alternative_assets_insert_editor on public.alternative_assets
    for insert with check (public.has_space_role(space_id, array['owner','admin','editor']::member_role[]));
drop policy if exists alternative_assets_update_editor on public.alternative_assets;
create policy alternative_assets_update_editor on public.alternative_assets
    for update using (public.has_space_role(space_id, array['owner','admin','editor']::member_role[]));
drop policy if exists alternative_assets_delete_admin on public.alternative_assets;
create policy alternative_assets_delete_admin on public.alternative_assets
    for delete using (public.has_space_role(space_id, array['owner','admin']::member_role[]));

-- -----------------------------------------------------------------------------
-- BUDGETS multimoneda: mismo patron original+tasa+base que transactions
-- (0001), para poder fijar un presupuesto en una moneda distinta a la del
-- espacio sin romper la comparacion contra el gasto real (que siempre vive en
-- amount_base). El backfill deja el comportamiento actual intacto: toda fila
-- existente queda con currency = la moneda base de SU espacio y fx_rate = 1,
-- por lo que monthly_amount_base = monthly_amount exactamente como antes.
-- -----------------------------------------------------------------------------
do $$
begin
    if not exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'budgets' and column_name = 'currency') then
        alter table public.budgets add column currency char(3) not null default 'COP';
    end if;
    if not exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'budgets' and column_name = 'fx_rate') then
        alter table public.budgets add column fx_rate numeric(18,8) not null default 1;
    end if;
    if not exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'budgets' and column_name = 'monthly_amount_base') then
        alter table public.budgets add column monthly_amount_base numeric(18,2) generated always as (round(monthly_amount * fx_rate, 2)) stored;
    end if;
end $$;

update public.budgets b
set currency = s.base_currency
from public.spaces s
where s.id = b.space_id
  and b.currency is distinct from s.base_currency
  and b.fx_rate = 1;

comment on column public.budgets.currency is 'Moneda en la que la persona fijo el presupuesto. Default = moneda base del espacio (caso comun, sin friccion).';
comment on column public.budgets.fx_rate is 'Tasa currency -> moneda base del espacio, tomada de exchange_rates al guardar. 1 si currency ya es la moneda base.';
comment on column public.budgets.monthly_amount_base is 'monthly_amount convertido a la moneda base del espacio -- lo unico que get_monthly_report compara contra el gasto real (amount_base).';

-- get_monthly_report (0028) ahora compara contra monthly_amount_base en vez de
-- monthly_amount -- create or replace es idempotente, sin cambios de firma.
create or replace function public.get_monthly_report(p_space_id uuid, p_month date default date_trunc('month', timezone('utc', now()))::date)
returns jsonb
language sql
stable
security invoker
set search_path = public
as $$
    with bounds as (
        select
            date_trunc('month', p_month)::date as month_start,
            (date_trunc('month', p_month) + interval '1 month' - interval '1 day')::date as month_end
    ),
    month_txns as (
        select t.*
        from public.transactions t, bounds b
        where t.space_id = p_space_id and t.status = 'confirmed'
          and t.transaction_date >= b.month_start and t.transaction_date <= b.month_end
    ),
    totals as (
        select
            coalesce(sum(case when type = 'income' then amount_base else 0 end), 0) as total_income,
            coalesce(sum(case when type = 'expense' then amount_base else 0 end), 0) as total_expense
        from month_txns
    ),
    category_breakdown as (
        select
            c.id as category_id,
            c.name as category_name,
            coalesce(sum(mt.amount_base), 0) as total,
            bu.monthly_amount_base as budget_amount
        from public.categories c
        left join month_txns mt on mt.category_id = c.id and mt.type = 'expense'
        left join public.budgets bu on bu.category_id = c.id and bu.space_id = p_space_id
        where (c.space_id = p_space_id or c.space_id is null) and c.kind = 'expense'
        group by c.id, c.name, bu.monthly_amount_base
        having coalesce(sum(mt.amount_base), 0) > 0 or bu.monthly_amount_base is not null
    )
    select jsonb_build_object(
        'month_start', (select month_start from bounds),
        'month_end', (select month_end from bounds),
        'total_income', (select total_income from totals),
        'total_expense', (select total_expense from totals),
        'net_flow', (select total_income - total_expense from totals),
        'category_breakdown', coalesce((
            select jsonb_agg(jsonb_build_object(
                'category_id', category_id,
                'category_name', category_name,
                'total', total,
                'budget_amount', budget_amount
            ) order by total desc)
            from category_breakdown
        ), '[]'::jsonb)
    )
$$;



-- 0033: accounts.opening_balance_fx_rate + fix a account_balances/get_financial_history (saldo inicial en moneda extranjera) --

do $$
begin
    if not exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'accounts' and column_name = 'opening_balance_fx_rate') then
        alter table public.accounts add column opening_balance_fx_rate numeric(18,8) not null default 1;
    end if;
end $$;

comment on column public.accounts.opening_balance_fx_rate is 'Tasa currency -> moneda base del espacio vigente cuando se declaro/edito el saldo inicial. 1 si la cuenta ya esta en la moneda base (el caso de siempre, antes de 0032).';

create or replace view public.account_balances as
select
    a.id as account_id,
    a.space_id,
    a.name as account_name,
    a.type as account_type,
    a.currency as account_currency,
    a.is_active,
    round(a.opening_balance * a.opening_balance_fx_rate, 2)
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
group by a.id, a.space_id, a.name, a.type, a.currency, a.is_active, a.opening_balance, a.opening_balance_fx_rate;

comment on view public.account_balances is 'Saldo calculado deterministicamente por Postgres a partir de transacciones CONFIRMADAS. La IA nunca escribe este numero. current_balance esta en moneda base (via amount_base y opening_balance*opening_balance_fx_rate); current_balance_original es la suma cruda en la moneda propia de la cuenta.';

-- get_financial_history (0028): mismo fix, opening_balance*opening_balance_fx_rate
-- en vez de opening_balance crudo. Firma sin cambios -- create or replace idempotente.
create or replace function public.get_financial_history(p_space_id uuid, p_periods int default 12)
returns table (
    period_start date,
    assets       numeric,
    liabilities  numeric,
    net_worth    numeric,
    income       numeric,
    expense      numeric
)
language sql
stable
security invoker
set search_path = public
as $$
    with requested_months as (
        select (date_trunc('month', timezone('utc', now())) - (interval '1 month' * gs))::date as period_start
        from generate_series(0, greatest(p_periods - 1, 0)) as gs
    ),
    earliest_txn_month as (
        select date_trunc('month', min(transaction_date))::date as m
        from public.transactions
        where space_id = p_space_id and status = 'confirmed'
    ),
    series_start as (
        select least(
            (select min(period_start) from requested_months),
            coalesce((select m from earliest_txn_month), (select min(period_start) from requested_months))
        ) as m
    ),
    all_months as (
        select generate_series((select m from series_start), (select max(period_start) from requested_months), interval '1 month')::date as period_start
    ),
    account_month_deltas as (
        select
            a.id as account_id,
            a.type as account_type,
            round(a.opening_balance * a.opening_balance_fx_rate, 2) as opening_balance_base,
            am.period_start,
            coalesce(sum(case
                when t.type = 'income' and t.account_id = a.id then t.amount_base
                when t.type = 'expense' and t.account_id = a.id then -t.amount_base
                when t.type = 'transfer' and t.account_id = a.id then -t.amount_base
                when t.type = 'transfer' and t.destination_account_id = a.id then t.amount_base
                else 0
            end), 0) as delta
        from all_months am
        cross join public.accounts a
        left join public.transactions t
            on (t.account_id = a.id or t.destination_account_id = a.id)
            and t.status = 'confirmed'
            and date_trunc('month', t.transaction_date) = am.period_start
        where a.space_id = p_space_id
        group by a.id, a.type, a.opening_balance, a.opening_balance_fx_rate, am.period_start
    ),
    account_month_balances as (
        select
            account_id,
            account_type,
            period_start,
            opening_balance_base + sum(delta) over (partition by account_id order by period_start) as cumulative_balance
        from account_month_deltas
    ),
    period_totals as (
        select
            period_start,
            coalesce(sum(cumulative_balance) filter (where account_type <> 'credit_card'), 0) as assets,
            coalesce(-sum(cumulative_balance) filter (where account_type = 'credit_card' and cumulative_balance < 0), 0) as liabilities,
            coalesce(sum(cumulative_balance), 0) as net_worth
        from account_month_balances
        group by period_start
    ),
    month_flows as (
        select
            date_trunc('month', t.transaction_date)::date as period_start,
            coalesce(sum(case when t.type = 'income' then t.amount_base else 0 end), 0) as income,
            coalesce(sum(case when t.type = 'expense' then t.amount_base else 0 end), 0) as expense
        from public.transactions t
        where t.space_id = p_space_id and t.status = 'confirmed'
        group by 1
    )
    select
        rm.period_start,
        coalesce(pt.assets, 0) as assets,
        coalesce(pt.liabilities, 0) as liabilities,
        coalesce(pt.net_worth, 0) as net_worth,
        coalesce(mf.income, 0) as income,
        coalesce(mf.expense, 0) as expense
    from requested_months rm
    left join period_totals pt on pt.period_start = rm.period_start
    left join month_flows mf on mf.period_start = rm.period_start
    order by rm.period_start asc;
$$;



-- 0034: transactions.tax_treatment (heredado al confirmar) + backfill + get_fiscal_summary sin JOIN en vivo --

do $$
begin
    if not exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'transactions' and column_name = 'tax_treatment') then
        alter table public.transactions add column tax_treatment text check (tax_treatment in ('gravado', 'exento', 'no_gravado', 'deducible', 'no_deducible'));
    end if;
end $$;

comment on column public.transactions.tax_treatment is 'Clasificacion fiscal heredada de la categoria al confirmar (ver confirmTransaction) -- ajustable por movimiento desde el historial sin afectar la categoria ni otros movimientos. null = sin clasificar.';

-- Backfill unico: todo movimiento confirmado que hoy no tiene tax_treatment
-- propio hereda el de su categoria actual, exactamente el mismo numero que
-- get_fiscal_summary ya reportaba via el JOIN en vivo -- esta migracion no
-- cambia ningun total existente, solo lo fija.
update public.transactions t
set tax_treatment = cft.tax_treatment
from public.category_fiscal_tags cft
where cft.category_id = t.category_id
  and cft.space_id = t.space_id
  and t.tax_treatment is null
  and t.status = 'confirmed';

create index if not exists idx_transactions_tax_treatment on public.transactions (space_id, tax_treatment) where tax_treatment is not null;

-- get_fiscal_summary (0030) ahora lee t.tax_treatment directamente en vez de
-- unir con category_fiscal_tags en vivo -- firma sin cambios, create or
-- replace idempotente.
create or replace function public.get_fiscal_summary(p_space_id uuid, p_year int default extract(year from timezone('utc', now()))::int)
returns jsonb
language sql
stable
security invoker
set search_path = public
as $$
    with year_txns as (
        select
            t.type,
            t.amount_base,
            t.withholding_tax_amount,
            extract(month from timezone('utc', t.transaction_date))::int as month,
            t.tax_treatment
        from public.transactions t
        where t.space_id = p_space_id
          and t.status = 'confirmed'
          and t.type in ('income', 'expense')
          and extract(year from timezone('utc', t.transaction_date)) = p_year
    ),
    totals as (
        select
            coalesce(sum(amount_base) filter (where type = 'income' and tax_treatment = 'gravado'), 0) as income_gravado,
            coalesce(sum(amount_base) filter (where type = 'income' and tax_treatment = 'exento'), 0) as income_exento,
            coalesce(sum(amount_base) filter (where type = 'income' and tax_treatment = 'no_gravado'), 0) as income_no_gravado,
            coalesce(sum(amount_base) filter (where type = 'income' and tax_treatment is null), 0) as income_unclassified,
            coalesce(sum(amount_base) filter (where type = 'expense' and tax_treatment = 'deducible'), 0) as expense_deducible,
            coalesce(sum(amount_base) filter (where type = 'expense' and tax_treatment = 'no_deducible'), 0) as expense_no_deducible,
            coalesce(sum(amount_base) filter (where type = 'expense' and tax_treatment is null), 0) as expense_unclassified,
            coalesce(sum(withholding_tax_amount), 0) as withholding_tax_total
        from year_txns
    ),
    monthly as (
        select
            month,
            coalesce(sum(amount_base) filter (where type = 'income' and tax_treatment = 'gravado'), 0) as income_gravado,
            coalesce(sum(amount_base) filter (where type = 'income' and tax_treatment = 'exento'), 0) as income_exento,
            coalesce(sum(amount_base) filter (where type = 'income' and tax_treatment = 'no_gravado'), 0) as income_no_gravado,
            coalesce(sum(amount_base) filter (where type = 'expense' and tax_treatment = 'deducible'), 0) as expense_deducible,
            coalesce(sum(amount_base) filter (where type = 'expense' and tax_treatment = 'no_deducible'), 0) as expense_no_deducible,
            coalesce(sum(withholding_tax_amount), 0) as withholding_tax_total
        from year_txns
        group by month
    )
    select jsonb_build_object(
        'year', p_year,
        'income_gravado', (select income_gravado from totals),
        'income_exento', (select income_exento from totals),
        'income_no_gravado', (select income_no_gravado from totals),
        'income_unclassified', (select income_unclassified from totals),
        'expense_deducible', (select expense_deducible from totals),
        'expense_no_deducible', (select expense_no_deducible from totals),
        'expense_unclassified', (select expense_unclassified from totals),
        'withholding_tax_total', (select withholding_tax_total from totals),
        'monthly', coalesce((
            select jsonb_agg(jsonb_build_object(
                'month', month,
                'income_gravado', income_gravado,
                'income_exento', income_exento,
                'income_no_gravado', income_no_gravado,
                'expense_deducible', expense_deducible,
                'expense_no_deducible', expense_no_deducible,
                'withholding_tax_total', withholding_tax_total
            ) order by month)
            from monthly
        ), '[]'::jsonb)
    )
$$;


commit;
