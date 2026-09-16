-- Aplica solo la migracion 0031. Pega esto en el SQL Editor de Supabase y
-- dale Run. Crea space_notification_channels (webhook/Telegram),
-- bills.reminder_sent_at, y permite bill_reminder_days = 0 ("el mismo dia").
-- Idempotente.

begin;

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

commit;
