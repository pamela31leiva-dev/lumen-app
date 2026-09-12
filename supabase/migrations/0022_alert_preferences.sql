-- =============================================================================
-- 0022_alert_preferences.sql
-- Preferencias de Alertas: hoy el umbral de "factura por vencer" esta fijo
-- en 3 dias, hardcodeado en dos componentes de cliente (BillAlerts,
-- ActionFeed). Se mueve a una columna por espacio -- cada espacio decide su
-- propio ritmo (una empresa puede querer 7 dias de anticipacion, una cuenta
-- personal con 1 factura puede preferir 1).
-- =============================================================================

alter table public.spaces
    add column bill_reminder_days smallint not null default 3 check (bill_reminder_days between 1 and 30);
