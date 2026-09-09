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
-- ENUMS
-- -----------------------------------------------------------------------------
create type space_type as enum ('personal', 'family', 'business', 'project');

create type member_role as enum ('owner', 'admin', 'editor', 'viewer');
-- owner: control total, incluye eliminar el espacio.
-- admin: gestiona miembros, cuentas y categorias.
-- editor: crea/edita/confirma transacciones y documentos.
-- viewer: solo lectura (ideal para contador externo, pareja, etc).

create type account_type as enum ('cash', 'bank', 'credit_card', 'digital_wallet', 'investment', 'other');

create type movement_type as enum ('income', 'expense', 'transfer');

create type capture_source as enum ('manual', 'ai_text', 'ai_voice', 'ai_photo', 'ai_document', 'import', 'telegram');

create type record_status as enum ('pending_confirmation', 'confirmed', 'rejected', 'archived');

create type document_kind as enum ('receipt', 'invoice', 'bank_statement', 'contract', 'other');

-- -----------------------------------------------------------------------------
-- PROFILES  (extiende auth.users; jamas se referencia auth.users directamente
-- desde el resto del esquema para no acoplar RLS a su estructura interna)
-- -----------------------------------------------------------------------------
create table public.profiles (
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
create table public.spaces (
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
create table public.space_members (
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
create table public.accounts (
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
create table public.categories (
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
create table public.receipts (
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
create table public.transactions (
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

create index idx_transactions_space_date on public.transactions (space_id, transaction_date desc);
create index idx_transactions_account on public.transactions (account_id);
create index idx_transactions_status on public.transactions (space_id, status) where status = 'pending_confirmation';
create index idx_receipts_space_status on public.receipts (space_id, status);
create index idx_accounts_space on public.accounts (space_id);
create index idx_categories_space on public.categories (space_id);
create index idx_space_members_user on public.space_members (user_id);

-- -----------------------------------------------------------------------------
-- AUDIT_LOGS  (historial inmutable; nunca se sobrescribe el pasado)
-- -----------------------------------------------------------------------------
create table public.audit_logs (
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

create index idx_audit_logs_space_entity on public.audit_logs (space_id, entity_type, entity_id);

-- =============================================================================
-- TRIGGERS
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

create trigger trg_profiles_updated_at before update on public.profiles
    for each row execute function public.set_updated_at();
create trigger trg_spaces_updated_at before update on public.spaces
    for each row execute function public.set_updated_at();
create trigger trg_accounts_updated_at before update on public.accounts
    for each row execute function public.set_updated_at();
create trigger trg_receipts_updated_at before update on public.receipts
    for each row execute function public.set_updated_at();
create trigger trg_transactions_updated_at before update on public.transactions
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

create trigger trg_spaces_after_insert after insert on public.spaces
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

create trigger trg_transactions_validate_space before insert or update
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

create trigger trg_transactions_audit after insert or update or delete
    on public.transactions
    for each row execute function public.write_audit_log();

create trigger trg_accounts_audit after insert or update or delete
    on public.accounts
    for each row execute function public.write_audit_log();

create trigger trg_receipts_audit after insert or update or delete
    on public.receipts
    for each row execute function public.write_audit_log();

-- =============================================================================
-- VISTA: saldo actual por cuenta (calculado, nunca almacenado directamente)
-- =============================================================================
create view public.account_balances as
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
-- ROW LEVEL SECURITY
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
create policy profiles_select_own on public.profiles
    for select using (id = auth.uid());
create policy profiles_update_own on public.profiles
    for update using (id = auth.uid());
create policy profiles_insert_own on public.profiles
    for insert with check (id = auth.uid());

-- SPACES ----------------------------------------------------------------------
create policy spaces_select_member on public.spaces
    for select using (public.is_space_member(id));
create policy spaces_insert_any_authenticated on public.spaces
    for insert with check (owner_id = auth.uid());
create policy spaces_update_admin on public.spaces
    for update using (public.has_space_role(id, array['owner','admin']::member_role[]));
create policy spaces_delete_owner on public.spaces
    for delete using (public.has_space_role(id, array['owner']::member_role[]));

-- SPACE_MEMBERS -----------------------------------------------------------------
create policy space_members_select_member on public.space_members
    for select using (public.is_space_member(space_id));
create policy space_members_insert_admin on public.space_members
    for insert with check (public.has_space_role(space_id, array['owner','admin']::member_role[]));
create policy space_members_update_admin on public.space_members
    for update using (public.has_space_role(space_id, array['owner','admin']::member_role[]));
create policy space_members_delete_admin_or_self on public.space_members
    for delete using (
        public.has_space_role(space_id, array['owner','admin']::member_role[])
        or user_id = auth.uid()
    );

-- ACCOUNTS ----------------------------------------------------------------------
create policy accounts_select_member on public.accounts
    for select using (public.is_space_member(space_id));
create policy accounts_insert_editor on public.accounts
    for insert with check (public.has_space_role(space_id, array['owner','admin','editor']::member_role[]));
create policy accounts_update_editor on public.accounts
    for update using (public.has_space_role(space_id, array['owner','admin','editor']::member_role[]));
create policy accounts_delete_admin on public.accounts
    for delete using (public.has_space_role(space_id, array['owner','admin']::member_role[]));

-- CATEGORIES ----------------------------------------------------------------------
create policy categories_select_member_or_global on public.categories
    for select using (space_id is null or public.is_space_member(space_id));
create policy categories_insert_editor on public.categories
    for insert with check (space_id is not null and public.has_space_role(space_id, array['owner','admin','editor']::member_role[]));
create policy categories_update_editor on public.categories
    for update using (space_id is not null and public.has_space_role(space_id, array['owner','admin','editor']::member_role[]));
create policy categories_delete_admin on public.categories
    for delete using (space_id is not null and public.has_space_role(space_id, array['owner','admin']::member_role[]));

-- RECEIPTS ----------------------------------------------------------------------
create policy receipts_select_member on public.receipts
    for select using (public.is_space_member(space_id));
create policy receipts_insert_editor on public.receipts
    for insert with check (public.has_space_role(space_id, array['owner','admin','editor']::member_role[]));
create policy receipts_update_editor on public.receipts
    for update using (public.has_space_role(space_id, array['owner','admin','editor']::member_role[]));
create policy receipts_delete_admin on public.receipts
    for delete using (public.has_space_role(space_id, array['owner','admin']::member_role[]));

-- TRANSACTIONS ----------------------------------------------------------------------
create policy transactions_select_member on public.transactions
    for select using (public.is_space_member(space_id));
create policy transactions_insert_editor on public.transactions
    for insert with check (public.has_space_role(space_id, array['owner','admin','editor']::member_role[]));
create policy transactions_update_editor on public.transactions
    for update using (public.has_space_role(space_id, array['owner','admin','editor']::member_role[]));
create policy transactions_delete_admin on public.transactions
    for delete using (public.has_space_role(space_id, array['owner','admin']::member_role[]));

-- AUDIT_LOGS: solo lectura para miembros; ninguna politica de escritura, por lo
-- que INSERT/UPDATE/DELETE del cliente quedan bloqueados. Solo el trigger
-- (SECURITY DEFINER, corre como el dueno de la funcion) puede insertar. -------
create policy audit_logs_select_member on public.audit_logs
    for select using (public.is_space_member(space_id));

-- =============================================================================
-- SEED MINIMO: categorias globales del sistema (space_id null)
-- =============================================================================
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
    (null, null, 'Otros ingresos', 'plus-circle', 'income', true);
