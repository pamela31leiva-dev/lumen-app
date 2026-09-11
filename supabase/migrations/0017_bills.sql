-- =============================================================================
-- 0017_bills.sql
-- Modulo de Facturas y Alertas de Vencimiento: obligaciones pendientes
-- conocidas de antemano (servicios publicos, recibos) con monto y fecha
-- limite, DISTINTAS de RecurringObligation (que infiere patrones del
-- historial ya confirmado). Una factura es un dato que el usuario ya sabe
-- que va a llegar y quiere que Lumen se lo recuerde -- no algo que la IA
-- detecta, asi que no pasa por el pipeline de extraccion.
-- =============================================================================

create table public.bills (
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

comment on table public.bills is 'Facturas/obligaciones conocidas con fecha limite (servicios publicos, recibos). "Requiere tu atencion" alerta cuando faltan <=3 dias o ya vencio.';

create index idx_bills_space_due on public.bills (space_id, due_date) where status = 'pending';

alter table public.bills enable row level security;

create policy bills_select_member on public.bills
    for select using (public.is_space_member(space_id));
create policy bills_insert_editor on public.bills
    for insert with check (public.has_space_role(space_id, array['owner','admin','editor']::member_role[]));
create policy bills_update_editor on public.bills
    for update using (public.has_space_role(space_id, array['owner','admin','editor']::member_role[]));
create policy bills_delete_admin on public.bills
    for delete using (public.has_space_role(space_id, array['owner','admin']::member_role[]));
