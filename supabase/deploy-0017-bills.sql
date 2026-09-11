-- Aplica solo la migracion 0017. Pega esto en el SQL Editor de Supabase y
-- dale Run. Crea la tabla bills (facturas/obligaciones con fecha limite)
-- para las alertas de vencimiento en "Requiere tu atencion".

begin;

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

commit;
