'use server';

import { getSupabaseServerClient } from '@/infrastructure/supabase/server';
import { processUblInvoiceWithClient, type UblInvoiceUploadResult } from '@/actions/invoice-core';

export type { UblInvoiceUploadResult } from '@/actions/invoice-core';

/**
 * Recibe un XML UBL de factura electronica DIAN ya subido a Storage (mismo
 * bucket `receipts` y convencion `<space_id>/<archivo>` que el resto de
 * documentos, ver CommandConsole.tsx), lo interpreta con el parser
 * determinista (parse-ubl-invoice.ts, sin IA ni OCR) y crea el receipt +
 * la obligacion (bills) correspondiente.
 *
 * El pipeline en si vive en invoice-core.ts, compartido con el webhook de la
 * Bandeja Automatica.
 */
export async function processUblInvoiceUpload(
  spaceId: string,
  storagePath: string,
  originalFilename: string,
): Promise<UblInvoiceUploadResult> {
  const supabase = await getSupabaseServerClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();
  if (authError || !user) return { success: false, error: 'No autorizado' };

  return processUblInvoiceWithClient(supabase, user.id, spaceId, storagePath, originalFilename);
}
