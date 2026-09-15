import type { AnySupabaseClient } from '@/actions/merchant-rules-core';
import { fetchActiveMerchantRules } from '@/actions/merchant-rules-core';
import { getAiExtractionAdapter } from '@/infrastructure/ai/adapter';
import { reportError } from '@/lib/telemetry/reporter';
import { inferFolderFromHistory, inferFolderFromKeywords, type FolderHistoryEntry } from '@/domain/ai/folder-inference';
import { folderOf, folderToColumns } from '@/domain/folders';
import { matchMerchantRule, mergeTags } from '@/domain/rules/merchant-rules';
import type { CreatePendingCaptureDTO, ProcessCaptureResult } from '@/domain/types/capture';

/**
 * Logica compartida de captura -> pending_confirmation, extraida de
 * actions/capture.ts para que tanto la Server Action normal (sesion de
 * usuario) como el webhook de la Bandeja Automatica (service_role, sin
 * sesion -- ver app/api/inbound/documents/route.ts) puedan ejecutar el mismo
 * pipeline con un `userId` explicito en vez de `auth.getUser()`.
 *
 * NO lleva 'use server': un archivo con esa directiva no puede exportar una
 * funcion cuyo primer parametro es un cliente de Supabase (no serializable),
 * asi que la logica reutilizable vive aqui y actions/capture.ts solo hace de
 * envoltorio delgado para el caso con sesion.
 */
export async function processCaptureWithClient(
  supabase: AnySupabaseClient,
  userId: string,
  payload: CreatePendingCaptureDTO,
): Promise<ProcessCaptureResult> {
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
    .eq('user_id', userId)
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
    const message = err instanceof Error ? err.message : String(err);
    await reportError({
      source: 'ai-extraction',
      message,
      stack: err instanceof Error ? err.stack : undefined,
      context: { spaceId: payload.space_id, captureSource: payload.capture_source },
    });

    // Ni el proveedor externo ni el motor local pudieron interpretar esto
    // (Gemini caido/lento + el texto no calzo con ningun patron conocido, o
    // era una foto/documento sin texto). La entrada JAMAS se descarta: se
    // guarda como receipt con processing_error, visible y recuperable desde
    // el Centro de Ingesta (reintentar o completar a mano) en vez de
    // perderse en un mensaje de error que no deja rastro.
    const { data: failedReceipt, error: failedReceiptError } = await supabase
      .from('receipts')
      .insert({
        space_id: payload.space_id,
        uploaded_by: userId,
        capture_source: payload.capture_source,
        storage_path: payload.storage_path ?? null,
        mime_type: payload.mime_type ?? null,
        original_filename: payload.original_filename ?? null,
        raw_transcript: payload.raw_text ?? null,
        status: 'pending_confirmation',
        processing_error: message,
      })
      .select('id')
      .single();

    if (failedReceiptError) {
      console.error('Error al guardar la entrada fallida para revision posterior:', failedReceiptError);
    }

    return {
      success: false,
      error:
        'No pudimos interpretar completamente esta captura en este momento. Tu informacion esta guardada. Puedes completar los datos manualmente o intentar procesarla nuevamente desde el Centro de Ingesta.',
      receiptId: failedReceipt?.id ?? null,
    };
  }

  // Escudo de legibilidad: si la imagen/documento esta arrugado, cortado o
  // ilegible al punto de que el monto leido no es confiable, es peor guardar
  // un numero probablemente equivocado (ej. leer $15.000 en vez de $67.000)
  // que no guardar nada. Solo aplica a fuentes con imagen/documento adjunto.
  const isDocumentSource = payload.capture_source === 'ai_photo' || payload.capture_source === 'ai_document';
  if (isDocumentSource && extraction.document_legibility_issue) {
    return {
      success: false,
      illegible: true,
      error: 'Factura ilegible o arrugada. Te sugerimos registrar el monto por voz o texto manual.',
    };
  }

  // Sin un monto no hay nada que registrar (transactions exige
  // amount_original > 0): mejor un mensaje claro e inmediato aqui que dejar
  // que el insert siguiente truene contra esa constraint con un error
  // generico. Un numero suelto SI trae amount_original (ver system-prompt.ts
  // "Numero suelto sin descripcion"), asi que esto solo dispara para
  // entradas realmente vacias o sin ningun contexto financiero.
  if (extraction.amount_original === null) {
    return {
      success: false,
      error: 'No pude identificar un monto. Especifica el concepto, ej: "50.000 almuerzo".',
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
      uploaded_by: userId,
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

  // Reglas Inteligentes por Comercio (0027): una regla explicita del usuario
  // es una señal mas fuerte que cualquier inferencia -- si la descripcion
  // calza con una regla activa, su categoria/cuenta/carpeta ganan sobre lo
  // que haya propuesto la IA (que sigue disponible para lo que la regla no
  // especifique). Nunca se auto-confirma nada: solo pre-llena la transaccion
  // pending_confirmation, igual que cualquier otra captura.
  const description = extraction.concept ?? extraction.merchant_name ?? null;
  const merchantRules = await fetchActiveMerchantRules(supabase, payload.space_id);
  const ruleMatch = matchMerchantRule(description, merchantRules);

  let finalFolder = folderOf({ isBusiness: Boolean(extraction.is_business), lifeDomain: extraction.is_business ? null : extraction.life_domain });

  if (ruleMatch?.folder) {
    finalFolder = ruleMatch.folder;
  } else if (finalFolder === 'personal') {
    // Motor de Inferencia Inteligente por Palabras Clave e Historial: red de
    // seguridad para cuando la IA no encontro una señal clara y clasifico por
    // default en Personal, aunque el texto si tenga una pista real ("desayuno
    // con mi hijo" -- ninguna palabra de negocio/salud, pero "hijo" ya deberia
    // bastar para Familiar). Nunca pelea con una clasificacion de la IA que ya
    // sea distinta de Personal -- solo actua quiando la IA se quedo corta.
    const descriptionText = payload.raw_text ?? description ?? '';

    const { data: historyRows } = await supabase
      .from('transactions')
      .select('description, is_business, life_domain')
      .eq('space_id', payload.space_id)
      .eq('status', 'confirmed')
      .order('transaction_date', { ascending: false })
      .limit(200);
    const history: FolderHistoryEntry[] = (historyRows ?? []).map((row) => ({
      description: row.description,
      folder: folderOf({ isBusiness: row.is_business, lifeDomain: row.life_domain }),
    }));

    finalFolder = inferFolderFromHistory(descriptionText, history) ?? inferFolderFromKeywords(descriptionText) ?? 'personal';
  }

  const folderColumns = folderToColumns(finalFolder);

  // exchange_rate se deja en 1: la tasa de cambio real es un dato
  // deterministico (tabla de tasas o servicio de FX del backend), nunca algo
  // que el LLM deba inventar. Si currency_original != base_currency, el
  // usuario la corrige explicitamente al confirmar.
  const { data: transaction, error: txError } = await supabase
    .from('transactions')
    .insert({
      space_id: payload.space_id,
      type: extraction.type ?? 'expense',
      account_id: ruleMatch?.accountId ?? extraction.suggested_account_id ?? null,
      category_id: ruleMatch?.categoryId ?? null,
      amount_original: extraction.amount_original ?? 0,
      currency_original: extraction.currency_original ?? space.base_currency,
      exchange_rate: 1,
      receipt_id: receiptId,
      source: payload.capture_source,
      status: 'pending_confirmation',
      confidence_score: extraction.confidence_score,
      ai_raw_interpretation: enrichedExtraction,
      description,
      transaction_date: extraction.transaction_date ?? new Date().toISOString(),
      created_by: userId,
      tags: ruleMatch ? mergeTags(extraction.suggested_tags ?? [], ruleMatch.tags) : (extraction.suggested_tags ?? []),
      ...folderColumns,
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
