'use server';

import { getSupabaseServerClient } from '@/infrastructure/supabase/server';
import { processIncomingCapture } from '@/actions/capture';
import type { AiCaptureSource } from '@/domain/types/capture';

/**
 * Centro de Ingesta: toda captura que ni el proveedor externo (Gemini) ni el
 * motor local determinista pudieron interpretar queda guardada como receipt
 * con `processing_error` (ver actions/capture.ts) -- nunca se pierde. Este
 * modulo es la unica forma de ver, reintentar, corregir o descartar esas
 * entradas, para que "no se pudo interpretar" nunca sea un callejon sin
 * salida.
 */
export interface FailedCaptureSummary {
  id: string;
  captureSource: AiCaptureSource;
  rawText: string | null;
  hasFile: boolean;
  originalFilename: string | null;
  processingError: string;
  createdAt: string;
}

export async function getFailedCaptures(spaceId: string): Promise<FailedCaptureSummary[]> {
  const supabase = await getSupabaseServerClient();

  const { data, error } = await supabase
    .from('receipts')
    .select('id, capture_source, raw_transcript, storage_path, original_filename, processing_error, created_at')
    .eq('space_id', spaceId)
    .eq('status', 'pending_confirmation')
    .not('processing_error', 'is', null)
    .order('created_at', { ascending: false });

  if (error) {
    console.error('Error al leer capturas fallidas:', error);
    return [];
  }

  return (data ?? []).map((row) => ({
    id: row.id,
    captureSource: row.capture_source as AiCaptureSource,
    rawText: row.raw_transcript,
    hasFile: row.storage_path !== null,
    originalFilename: row.original_filename,
    processingError: row.processing_error as string,
    createdAt: row.created_at,
  }));
}

interface FailedReceiptRow {
  space_id: string;
  capture_source: AiCaptureSource;
  raw_transcript: string | null;
  storage_path: string | null;
  mime_type: string | null;
  original_filename: string | null;
}

async function loadFailedReceipt(
  supabase: Awaited<ReturnType<typeof getSupabaseServerClient>>,
  spaceId: string,
  receiptId: string,
): Promise<FailedReceiptRow | null> {
  const { data, error } = await supabase
    .from('receipts')
    .select('space_id, capture_source, raw_transcript, storage_path, mime_type, original_filename')
    .eq('id', receiptId)
    .eq('space_id', spaceId)
    .not('processing_error', 'is', null)
    .maybeSingle();

  if (error || !data) return null;
  return data as FailedReceiptRow;
}

/**
 * Reintenta la MISMA entrada (sin editar) a traves del pipeline normal
 * (Gemini -> motor local, ver adapter.ts). Si el reintento genera un
 * resultado nuevo (exito o fallo), la entrada vieja se elimina para no
 * duplicarla en el Centro de Ingesta -- processIncomingCapture ya crea su
 * propio receipt fresco representando este intento.
 */
export async function retryFailedCapture(
  spaceId: string,
  receiptId: string,
): Promise<{ success: true; transactionId: string } | { success: false; error: string }> {
  const supabase = await getSupabaseServerClient();
  const receipt = await loadFailedReceipt(supabase, spaceId, receiptId);
  if (!receipt) {
    return { success: false, error: 'No se encontro esa entrada, o ya fue resuelta.' };
  }

  const result = await processIncomingCapture({
    space_id: spaceId,
    capture_source: receipt.capture_source,
    raw_text: receipt.raw_transcript ?? undefined,
    storage_path: receipt.storage_path ?? undefined,
    mime_type: receipt.mime_type ?? undefined,
    original_filename: receipt.original_filename ?? undefined,
  });

  await supabase.from('receipts').delete().eq('id', receiptId).eq('space_id', spaceId);

  if (!result.success) {
    return { success: false, error: result.error };
  }
  return { success: true, transactionId: result.transactionId };
}

/** Igual que retryFailedCapture, pero con el texto corregido a mano antes de reprocesar -- solo aplica a capturas de texto/voz. */
export async function editAndRetryFailedCapture(
  spaceId: string,
  receiptId: string,
  correctedText: string,
): Promise<{ success: true; transactionId: string } | { success: false; error: string }> {
  const trimmed = correctedText.trim();
  if (!trimmed) {
    return { success: false, error: 'Escribe el movimiento antes de reintentar.' };
  }

  const supabase = await getSupabaseServerClient();
  const receipt = await loadFailedReceipt(supabase, spaceId, receiptId);
  if (!receipt) {
    return { success: false, error: 'No se encontro esa entrada, o ya fue resuelta.' };
  }

  const result = await processIncomingCapture({
    space_id: spaceId,
    capture_source: 'ai_text',
    raw_text: trimmed,
  });

  await supabase.from('receipts').delete().eq('id', receiptId).eq('space_id', spaceId);

  if (!result.success) {
    return { success: false, error: result.error };
  }
  return { success: true, transactionId: result.transactionId };
}

/** Descarta una entrada fallida sin reintentar -- queda como 'rejected' para trazabilidad, nunca se borra en silencio. */
export async function discardFailedCapture(
  spaceId: string,
  receiptId: string,
): Promise<{ success: true } | { success: false; error: string }> {
  const supabase = await getSupabaseServerClient();

  const { error, count } = await supabase
    .from('receipts')
    .update({ status: 'rejected' }, { count: 'exact' })
    .eq('id', receiptId)
    .eq('space_id', spaceId)
    .not('processing_error', 'is', null);

  if (error) {
    console.error('Error al descartar la entrada fallida:', error);
    return { success: false, error: 'No se pudo descartar esta entrada.' };
  }
  if (!count) {
    return { success: false, error: 'No se encontro esa entrada, o ya fue resuelta.' };
  }

  return { success: true };
}
