'use server';

import { getSupabaseServerClient } from '@/infrastructure/supabase/server';
import { checkStorageQuotaWithClient, getSpacePlanLimitsWithClient } from '@/actions/plan-limits-core';

/**
 * Unica funcion que el resto de la app debe llamar para saber si un espacio
 * es Pro (ver get_space_plan_limits, 0036) -- reemplaza leer
 * spaces.is_pro directamente.
 */
export async function checkSpaceIsPro(spaceId: string): Promise<boolean> {
  const supabase = await getSupabaseServerClient();
  const limits = await getSpacePlanLimitsWithClient(supabase, spaceId);
  return limits?.isPro ?? false;
}

/**
 * Envoltorio con sesion para checkStorageQuotaWithClient -- lo llaman los
 * componentes de cliente (CommandConsole, XmlInvoiceUploadModal) ANTES de
 * subir un archivo a Storage. El webhook de la Bandeja Automatica (sin
 * sesion) llama directo a la version "WithClient" con su cliente service_role.
 */
export async function checkStorageQuota(spaceId: string, incomingBytes: number) {
  const supabase = await getSupabaseServerClient();
  return checkStorageQuotaWithClient(supabase, spaceId, incomingBytes);
}
