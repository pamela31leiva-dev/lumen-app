-- =============================================================================
-- 0015_pro_spaces_and_realtime.sql
-- Dos piezas de la arquitectura del plan maestro:
--
-- 1. Monetizacion asimetrica: is_pro por ESPACIO (no por usuario -- ver
--    0008_subscriptions.sql, que sigue existiendo para el plan del usuario
--    en si). Un espacio de tipo 'business' con is_pro=false sigue usandose
--    con toda normalidad (registrar, confirmar, ver saldos); solo las
--    capacidades avanzadas de analitica de negocio (Picos de Venta,
--    proyeccion de caja de negocio, exportacion para contadores) se
--    condicionan a is_pro en el codigo de aplicacion. Personal/Familiar/
--    Proyecto nunca se ven afectados por esta columna. Activacion manual via
--    service_role por ahora (no hay pasarela de pago conectada) -- mismo
--    modelo que subscriptions.
--
-- 2. Espacios colaborativos en tiempo real: agrega 'transactions' a la
--    publicacion supabase_realtime para que los cambios (nuevas capturas,
--    confirmaciones) se transmitan en vivo a todos los miembros conectados
--    al mismo espacio. Realtime respeta las policies RLS existentes de
--    transactions -- nadie ve cambios de un espacio al que no pertenece.
--    REPLICA IDENTITY FULL asegura que el payload de UPDATE incluya la fila
--    completa (necesario para saber, por ejemplo, que status paso a
--    'confirmed' y quien lo hizo).
-- =============================================================================

alter table public.spaces add column is_pro boolean not null default false;

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
