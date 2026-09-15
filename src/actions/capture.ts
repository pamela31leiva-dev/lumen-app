'use server';

import { getSupabaseServerClient } from '@/infrastructure/supabase/server';
import { processCaptureWithClient } from '@/actions/capture-core';
import type { CreatePendingCaptureDTO, ProcessCaptureResult } from '@/domain/types/capture';

/**
 * Recibe una entrada no estructurada (texto, transcripcion de voz, o un
 * documento ya subido a Storage), la interpreta con IA, y guarda un
 * `receipt` + una `transaction` en estado pending_confirmation.
 *
 * La verificacion de membresia aqui es solo una salida temprana amigable:
 * el limite de seguridad real son las politicas RLS de Postgres, que
 * rechazarian el insert de todas formas si el usuario no pertenece al espacio.
 *
 * El pipeline en si (extraccion + reglas de comercio + insercion) vive en
 * capture-core.ts, compartido con el webhook de la Bandeja Automatica.
 */
export async function processIncomingCapture(payload: CreatePendingCaptureDTO): Promise<ProcessCaptureResult> {
  const supabase = await getSupabaseServerClient();

  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();
  if (authError || !user) {
    return { success: false, error: 'No autorizado' };
  }

  return processCaptureWithClient(supabase, user.id, payload);
}
