import type { AnySupabaseClient } from '@/actions/merchant-rules-core';
import { parseUblInvoiceXml, type ParsedUblInvoice } from '@/domain/import/parse-ubl-invoice';

const POSTGRES_UNIQUE_VIOLATION = '23505';

export type UblInvoiceUploadResult =
  | { success: true; receiptId: string; billId: string; invoice: ParsedUblInvoice }
  | { success: false; error: string; receiptId?: string | null };

/**
 * Logica compartida de factura XML UBL -> receipt + bill, extraida de
 * actions/invoices.ts para que tanto la Server Action normal (sesion de
 * usuario) como el webhook de la Bandeja Automatica (service_role, sin
 * sesion -- ver app/api/inbound/documents/route.ts) puedan ejecutar el mismo
 * pipeline con un `userId` explicito en vez de `auth.getUser()`.
 *
 * NO lleva 'use server' por la misma razon que capture-core.ts: recibe un
 * cliente de Supabase, que no es serializable.
 */
export async function processUblInvoiceWithClient(
  supabase: AnySupabaseClient,
  userId: string,
  spaceId: string,
  storagePath: string,
  originalFilename: string,
): Promise<UblInvoiceUploadResult> {
  const { data: fileBlob, error: downloadError } = await supabase.storage.from('receipts').download(storagePath);
  if (downloadError || !fileBlob) {
    console.error('Error al descargar el XML de la factura:', downloadError);
    return { success: false, error: 'No se pudo leer el archivo subido.' };
  }

  const xmlText = await fileBlob.text();
  const parseResult = parseUblInvoiceXml(xmlText);

  if (!parseResult.success) {
    // Igual que el resto de capturas fallidas (ver capture-core.ts): el
    // XML nunca se pierde, queda visible con su error para revision manual.
    const { data: failedReceipt, error: failedReceiptError } = await supabase
      .from('receipts')
      .insert({
        space_id: spaceId,
        uploaded_by: userId,
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
      uploaded_by: userId,
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
      created_by: userId,
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
