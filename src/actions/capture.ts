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
    .select('name, base_currency')
    .eq('id', payload.space_id)
    .single();
  if (spaceError || !space) {
    return { success: false, error: 'No tienes acceso a este espacio' };
  }

  const { data: hintRows } = await supabase
    .from('classification_hints')
    .select('question, answer')
    .eq('space_id', payload.space_id)
    .order('created_at', { ascending: false })
    .limit(20);
  const learnedHints = (hintRows ?? []).map((h) => `${h.question} -> ${h.answer}`);

  // Otros espacios del usuario, para que la IA pueda detectar si el texto
  // pertenece claramente a uno de ellos en vez de al activo (evita friccion
  // de tener que cambiar de espacio manualmente antes de capturar).
  const { data: otherSpaceRows } = await supabase
    .from('space_members')
    .select('space:spaces(id, name)')
    .eq('user_id', user.id)
    .returns<{ space: { id: string; name: string } | null }[]>();
  const otherSpaces = (otherSpaceRows ?? [])
    .map((r) => r.space)
    .filter((s): s is { id: string; name: string } => s !== null && s.id !== payload.space_id);

  let extraction;
  try {
    const ai = getAiExtractionAdapter();
    extraction = await ai.extract({
      source: payload.capture_source,
      text: payload.raw_text,
      storagePath: payload.storage_path,
      mimeType: payload.mime_type,
      baseCurrency: space.base_currency,
      learnedHints,
      activeSpaceName: space.name,
      otherSpaceNames: otherSpaces.map((s) => s.name),
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

  // La IA solo puede nombrar un espacio de los que se le paso como contexto,
  // pero igual se resuelve contra la lista real (nunca se confia un id
  // inventado por el LLM) y solo se guarda si hay un match exacto.
  const matchedSpace = extraction.suggested_space_name
    ? otherSpaces.find((s) => s.name.trim().toLowerCase() === extraction.suggested_space_name!.trim().toLowerCase())
    : undefined;
  const enrichedExtraction = {
    ...extraction,
    resolved_suggested_space_id: matchedSpace?.id ?? null,
  };

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
      ai_extracted_data: enrichedExtraction,
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
      ai_raw_interpretation: enrichedExtraction,
      description: extraction.concept ?? extraction.merchant_name ?? null,
      transaction_date: extraction.transaction_date ?? new Date().toISOString(),
      created_by: user.id,
      tags: extraction.suggested_tags ?? [],
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
