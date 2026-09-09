'use server';

import { getSupabaseServerClient } from '@/infrastructure/supabase/server';
import { getAiExtractionAdapter } from '@/infrastructure/ai/adapter';
import { reportError } from '@/lib/telemetry/reporter';
import type { CreatePendingCaptureDTO, ProcessCaptureResult } from '@/domain/types/capture';

/**
 * Recibe una entrada no estructurada (texto, transcripcion de voz, o un
 * documento ya subido a Storage), la interpreta con IA, y guarda un
 * `receipt` + una `transaction` en estado pending_confirmation.
 *
 * La verificacion de membresia aqui es solo una salida temprana amigable:
 * el limite de seguridad real son las politicas RLS de Postgres, que
 * rechazarian el insert de todas formas si el usuario no pertenece al espacio.
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

  const { data: space, error: spaceError } = await supabase
    .from('spaces')
    .select('base_currency')
    .eq('id', payload.space_id)
    .single();
  if (spaceError || !space) {
    return { success: false, error: 'No tienes acceso a este espacio' };
  }

  let extraction;
  try {
    const ai = getAiExtractionAdapter();
    extraction = await ai.extract({
      source: payload.capture_source,
      text: payload.raw_text,
      storagePath: payload.storage_path,
      mimeType: payload.mime_type,
      baseCurrency: space.base_currency,
    });
  } catch (err) {
    await reportError({
      source: 'ai-extraction',
      message: err instanceof Error ? err.message : String(err),
      stack: err instanceof Error ? err.stack : undefined,
      context: { spaceId: payload.space_id, captureSource: payload.capture_source },
    });
    return {
      success: false,
      error: 'No se pudo interpretar la informacion. Intenta de nuevo o registra el movimiento manualmente.',
    };
  }

  let receiptId: string | null = null;
  const { data: receipt, error: receiptError } = await supabase
    .from('receipts')
    .insert({
      space_id: payload.space_id,
      uploaded_by: user.id,
      capture_source: payload.capture_source,
      storage_path: payload.storage_path ?? null,
      mime_type: payload.mime_type ?? null,
      original_filename: payload.original_filename ?? null,
      raw_transcript: payload.raw_text ?? null,
      ai_extracted_data: extraction,
      confidence_score: extraction.confidence_score,
      status: 'pending_confirmation',
    })
    .select('id')
    .single();

  if (receiptError) {
    console.error('Error al guardar el documento:', receiptError);
    return { success: false, error: 'No se pudo guardar el documento fuente.' };
  }
  receiptId = receipt.id;

  // exchange_rate se deja en 1: la tasa de cambio real es un dato
  // deterministico (tabla de tasas o servicio de FX del backend), nunca algo
  // que el LLM deba inventar. Si currency_original != base_currency, el
  // usuario la corrige explicitamente al confirmar.
  const { data: transaction, error: txError } = await supabase
    .from('transactions')
    .insert({
      space_id: payload.space_id,
      type: extraction.type ?? 'expense',
      account_id: extraction.suggested_account_id ?? null,
      amount_original: extraction.amount_original ?? 0,
      currency_original: extraction.currency_original ?? space.base_currency,
      exchange_rate: 1,
      receipt_id: receiptId,
      source: payload.capture_source,
      status: 'pending_confirmation',
      confidence_score: extraction.confidence_score,
      ai_raw_interpretation: extraction,
      description: extraction.concept ?? extraction.merchant_name ?? null,
      transaction_date: extraction.transaction_date ?? new Date().toISOString(),
      created_by: user.id,
    })
    .select('id')
    .single();

  if (txError) {
    console.error('Error al crear la transaccion pendiente:', txError);
    return { success: false, error: 'No se pudo crear el movimiento pendiente.' };
  }

  return {
    success: true,
    receiptId,
    transactionId: transaction.id,
    confidenceScore: extraction.confidence_score,
    needsReview: extraction.confidence_score < 0.85 || extraction.uncertainties.length > 0,
    uncertainties: extraction.uncertainties,
  };
}
