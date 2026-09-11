'use server';

import { getSupabaseServerClient } from '@/infrastructure/supabase/server';

/**
 * Simulador de Estatus Pro: activa is_pro=true para un espacio de Negocio
 * SIN pasarela de pago (no existe todavia -- ver 0015_pro_spaces_and_realtime.sql).
 * Pensado para esta fase de pruebas, donde se necesita explorar Picos de
 * Venta, Proyeccion de Caja y exportacion para contadores sin friccion
 * comercial. RLS (spaces_update_admin) sigue exigiendo owner/admin del
 * espacio, igual que renameSpace.
 */
export async function activateProSimulation(
  spaceId: string,
): Promise<{ success: true } | { success: false; error: string }> {
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
