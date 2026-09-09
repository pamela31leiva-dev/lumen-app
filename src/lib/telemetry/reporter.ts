import { getSupabaseServiceRoleClient } from '@/infrastructure/supabase/service-role-client';

/**
 * Capturador de errores central — modo $0: sin proveedor de correo de pago.
 * SIEMPRE deja un registro estructurado en los logs del servidor via
 * console.error (lo que Vercel u otro hosting capturan automaticamente), y
 * ADEMAS lo inserta en la tabla `system_logs` de Supabase (ya incluida en el
 * plan gratuito del proyecto) usando SUPABASE_SERVICE_ROLE_KEY — sin esa
 * llave, el reporte queda solo en logs de consola, nunca falla la operacion
 * que disparo el error por no poder registrar la telemetria.
 *
 * Server-only: nunca importar este archivo desde un Client Component (usa
 * src/actions/telemetry.ts como puente si necesitas reportar desde el cliente).
 */

export interface ErrorReport {
  /** De donde vino: 'client-error-boundary' | 'ai-extraction' | 'ai-extraction-primary-failed' | 'health-check' | etc. */
  source: string;
  message: string;
  stack?: string;
  digest?: string;
  context?: Record<string, unknown>;
  url?: string;
}

export async function reportError(report: ErrorReport): Promise<void> {
  // Esto SIEMPRE queda registrado, sin depender de ningun servicio externo.
  console.error(`[LUMEN TELEMETRY] ${report.source}: ${report.message}`, report);

  const supabase = getSupabaseServiceRoleClient();
  if (!supabase) return;

  try {
    const { error } = await supabase.from('system_logs').insert({
      source: report.source,
      message: report.message,
      stack: report.stack ?? null,
      digest: report.digest ?? null,
      context: { ...report.context, url: report.url },
    });

    if (error) {
      console.error('[LUMEN TELEMETRY] No se pudo insertar el log en system_logs:', error.message);
    }
  } catch (insertError) {
    console.error('[LUMEN TELEMETRY] Error inesperado escribiendo system_logs:', insertError);
  }
}
