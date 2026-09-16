-- =============================================================================
-- 0031_p6_notifications.sql
-- Bloque P6: Motor de Notificaciones y Recordatorios Proactivos. No existe
-- ningun bot de Telegram previo en este proyecto (capture_source incluye
-- 'telegram' desde 0001 como valor reservado, pero nunca se conecto nada) --
-- este bloque agrega DOS canales de salida reales: un webhook generico
-- (POST a cualquier URL -- Slack, Discord, Zapier, tu propio servidor) y
-- Telegram via la Bot API oficial (bot_token + chat_id que la persona
-- genera con @BotFather y pega en Ajustes, igual de "traido por el
-- usuario" que un webhook).
--
-- space_notification_channels guarda credenciales en texto plano (config
-- jsonb) -- a diferencia de inbound_channels (0027), que solo guarda un
-- hash porque el token viaja hacia adentro (nosotros lo verificamos), aqui
-- el bot_token/url viaja hacia AFUERA (nosotros lo usamos para enviar), asi
-- que debe poder leerse. Por eso el acceso queda restringido a owner/admin
-- en las 4 operaciones (ni siquiera select para editor/viewer) -- mas
-- estricto que el resto del esquema, justificado por la sensibilidad del dato.
--
-- bills.reminder_sent_at: evita reenviar el mismo aviso en cada corrida del
-- cron -- una factura recibe UN aviso proactivo, no un recordatorio diario.
-- =============================================================================

create table public.space_notification_channels (
    id            uuid primary key default gen_random_uuid(),
    space_id      uuid not null references public.spaces(id) on delete cascade,
    channel_type  text not null check (channel_type in ('webhook', 'telegram')),
    -- webhook: {"url": "https://..."} -- telegram: {"bot_token": "...", "chat_id": "..."}
    config        jsonb not null,
    is_active     boolean not null default true,
    created_by    uuid not null references public.profiles(id),
    created_at    timestamptz not null default now(),
    updated_at    timestamptz not null default now()
);

comment on table public.space_notification_channels is 'Canales de salida (webhook generico o Telegram) para avisos proactivos de facturas por vencer -- config guarda credenciales en claro (se necesitan para enviar), por eso el acceso es owner/admin en toda operacion, mas estricto que el resto del esquema.';

create index idx_space_notification_channels_space on public.space_notification_channels (space_id) where is_active;

create trigger trg_space_notification_channels_updated_at before update on public.space_notification_channels
    for each row execute function public.set_updated_at();

alter table public.space_notification_channels enable row level security;

create policy space_notification_channels_select_admin on public.space_notification_channels
    for select using (public.has_space_role(space_id, array['owner','admin']::member_role[]));
create policy space_notification_channels_insert_admin on public.space_notification_channels
    for insert with check (public.has_space_role(space_id, array['owner','admin']::member_role[]));
create policy space_notification_channels_update_admin on public.space_notification_channels
    for update using (public.has_space_role(space_id, array['owner','admin']::member_role[]));
create policy space_notification_channels_delete_admin on public.space_notification_channels
    for delete using (public.has_space_role(space_id, array['owner','admin']::member_role[]));

alter table public.bills add column reminder_sent_at timestamptz;

comment on column public.bills.reminder_sent_at is 'Cuando se envio el aviso proactivo (webhook/Telegram) de esta factura -- null hasta entonces. Un aviso por factura, no uno por cada corrida del cron.';

-- "El mismo dia" (0) ahora es un valor valido, ademas de 1-30.
alter table public.spaces drop constraint if exists spaces_bill_reminder_days_check;
alter table public.spaces add constraint spaces_bill_reminder_days_check check (bill_reminder_days between 0 and 30);
