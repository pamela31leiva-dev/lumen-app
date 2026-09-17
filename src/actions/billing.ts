'use server';

import { getSupabaseServerClient } from '@/infrastructure/supabase/server';

/**
 * Simulador de Estatus Pro: activa is_pro=true para un espacio de Negocio
 * SIN pasarela de pago (no existe todavia -- ver 0015_pro_spaces_and_realtime.sql).
 * Pensado para la fase de pruebas internas, donde se necesita explorar Picos
 * de Venta, Proyeccion de Caja y exportacion para contadores sin friccion
 * comercial. RLS (spaces_update_admin) sigue exigiendo owner/admin del
 * espacio, igual que renameSpace.
 *
 * AUDITORIA (Bloque P9): con usuarios reales externos, este boton regalaria
 * Pro para siempre con un solo clic -- cero verificacion de pago. Bloqueado
 * por variable de entorno (ausente/false por defecto = deshabilitado) hasta
 * que exista una pasarela de pago real; se reactiva a proposito en Vercel
 * (ENABLE_PRO_SIMULATION=true) solo mientras se siga demostrando el producto
 * sin cobro. Nunca depender de ocultar el boton en el cliente: RLS ya lo
 * exigia, pero la verificacion real debe vivir en el servidor.
 */
export async function activateProSimulation(
  spaceId: string,
): Promise<{ success: true } | { success: false; error: string }> {
  if (process.env.ENABLE_PRO_SIMULATION !== 'true') {
    return {
      success: false,
      error: 'La activacion de Pro sin pago esta deshabilitada. Escribe a soporte para activar tu plan.',
    };
  }

  const supabase = await getSupabaseServerClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();
  if (authError || !user) {
    return { success: false, error: 'No autorizado' };
  }

  const { error, count } = await supabase
    .from('spaces')
    .update({ is_pro: true }, { count: 'exact' })
    .eq('id', spaceId)
    .eq('type', 'business');

  if (error) {
    console.error('Error al activar Pro (simulacion):', error);
    return { success: false, error: 'No se pudo activar Pro para este espacio.' };
  }
  if (!count) {
    return { success: false, error: 'Solo espacios de Negocio pueden activar Pro, y necesitas rol Owner o Admin.' };
  }

  return { success: true };
}
