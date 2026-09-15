'use server';

import { getSupabaseServerClient } from '@/infrastructure/supabase/server';
import { parseUblInvoiceXml, type ParsedUblInvoice } from '@/domain/import/parse-ubl-invoice';

const POSTGRES_UNIQUE_VIOLATION = '23505';

export type UblInvoiceUploadResult =
  | { success: true; receiptId: string; billId: string; invoice: ParsedUblInvoice }
  | { success: false; error: string; receiptId?: string | null };

/**
 * Recibe un XML UBL de factura electronica DIAN ya subido a Storage (mismo
 * bucket `receipts` y convencion `<space_id>/<archivo>` que el resto de
 * documentos, ver CommandConsole.tsx), lo interpreta con el parser
 * determinista (parse-ubl-invoice.ts, sin IA ni OCR) y crea:
 *   1. El receipt: evidencia (XML original) + datos extraidos estructurados.
 *   2. La obligacion (bills) que esa factura representa, enlazada al receipt.
 * NUNCA crea una transaccion confirmada ni pendiente: pagar la factura sigue
 * pasando por el flujo existente markBillPaid (actions/bills.ts), exactamente
 * igual que una factura registrada a mano -- "Factura != Pago".
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

  const { data: fileBlob, error: downloadError } = await supabase.storage.from('receipts').download(storagePath);
  if (downloadError || !fileBlob) {
    console.error('Error al descargar el XML de la factura:', downloadError);
    return { success: false, error: 'No se pudo leer el archivo subido.' };
  }

  const xmlText = await fileBlob.text();
  const parseResult = parseUblInvoiceXml(xmlText);

  if (!parseResult.success) {
    // Igual que el resto de capturas fallidas (ver actions/capture.ts): el
    // XML nunca se pierde, queda visible con su error para revision manual.
    const { data: failedReceipt, error: failedReceiptError } = await supabase
      .from('receipts')
      .insert({
        space_id: spaceId,
        uploaded_by: user.id,
        kind: 'invoice',
        capture_source: 'xml_invoice',
        storage_path: storagePath,
        mime_type: 'application/xml',
        original_filename: originalFilename,
        status: 'pending_confirmation',
        processing_error: parseResult.error,
      })
      .select('id')
      .single();

    if (failedReceiptError) {
      console.error('Error al guardar la factura no interpretable para revision posterior:', failedReceiptError);
    }

    return { success: false, error: parseResult.error, receiptId: failedReceipt?.id ?? null };
  }

  const invoice = parseResult.invoice;

  if (invoice.payableAmount <= 0) {
    return {
      success: false,
      error: 'El total de la factura (PayableAmount) es cero o negativo. Revisa el XML; no se genera una obligacion automatica.',
    };
  }

  const { data: receipt, error: receiptError } = await supabase
    .from('receipts')
    .insert({
      space_id: spaceId,
      uploaded_by: user.id,
      kind: 'invoice',
      capture_source: 'xml_invoice',
      storage_path: storagePath,
      mime_type: 'application/xml',
      original_filename: originalFilename,
      ai_extracted_data: invoice,
      cufe: invoice.cufe,
      confidence_score: 1,
      status: 'pending_confirmation',
    })
    .select('id')
    .single();

  if (receiptError) {
    if (receiptError.code === POSTGRES_UNIQUE_VIOLATION) {
      return { success: false, error: `Esta factura (CUFE ${invoice.cufe}) ya fue registrada anteriormente en este espacio.` };
    }
    console.error('Error al guardar la factura interpretada:', receiptError);
    return { success: false, error: 'No se pudo guardar la factura.' };
  }

  const description = `Factura ${invoice.invoiceNumber}${invoice.supplier.name ? ` - ${invoice.supplier.name}` : ''}`;
  const { data: bill, error: billError } = await supabase
    .from('bills')
    .insert({
      space_id: spaceId,
      description,
      amount: invoice.payableAmount,
      currency: invoice.currency,
      due_date: invoice.dueDate ?? invoice.issueDate,
      created_by: user.id,
      receipt_id: receipt.id,
    })
    .select('id')
    .single();

  if (billError || !bill) {
    console.error('Error al crear la obligacion desde la factura:', billError);
    return {
      success: false,
      error: 'La factura se guardo como documento, pero no se pudo crear la obligacion de pago. Registrala manualmente.',
      receiptId: receipt.id,
    };
  }

  return { success: true, receiptId: receipt.id, billId: bill.id, invoice };
}
