import { NextResponse } from 'next/server';
import { createHash, randomUUID } from 'node:crypto';
import { getSupabaseServiceRoleClient } from '@/infrastructure/supabase/service-role-client';
import { processCaptureWithClient } from '@/actions/capture-core';
import { processUblInvoiceWithClient } from '@/actions/invoice-core';
import { reportError } from '@/lib/telemetry/reporter';

/**
 * Bandeja Automatica (Bloque P2-1): canal de recepcion generico y seguro
 * para que un sistema externo (reenvio de correo via un servicio de tu
 * eleccion, Zapier/Make, cualquier webhook autorizado) entregue documentos
 * SIN sesion de usuario. La autorizacion es un token por espacio (ver
 * actions/inbound-channels.ts) en vez de un JWT de Supabase, por eso este
 * endpoint usa el cliente service_role -- pero solo despues de validar el
 * token contra inbound_channels, y todo el resto del pipeline queda
 * estrictamente acotado al space_id de ese canal (nunca al que el caller
 * diga en el body).
 *
 * Sin friccion manual: el archivo recibido pasa directo al mismo pipeline
 * que una captura hecha a mano -- XML UBL -> parse-ubl-invoice.ts (factura +
 * obligacion), cualquier otro archivo -> el extractor de IA/motor local
 * (capture-core.ts), y texto plano -> el mismo motor via 'ai_text'.
 */

const MAX_FILE_SIZE_MB = 15;

function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

function sourceForMimeType(mimeType: string): 'ai_photo' | 'ai_document' {
  return mimeType.startsWith('image/') ? 'ai_photo' : 'ai_document';
}

export async function POST(request: Request) {
  const supabase = getSupabaseServiceRoleClient();
  if (!supabase) {
    return NextResponse.json({ error: 'Servicio no disponible.' }, { status: 503 });
  }

  const authHeader = request.headers.get('authorization');
  const url = new URL(request.url);
  const token = authHeader?.startsWith('Bearer ') ? authHeader.slice('Bearer '.length) : url.searchParams.get('token');
  if (!token) {
    return NextResponse.json({ error: 'Falta el token de autorizacion (header Authorization: Bearer, o ?token=).' }, { status: 401 });
  }

  const { data: channel, error: channelError } = await supabase
    .from('inbound_channels')
    .select('id, space_id, created_by, is_active')
    .eq('token_hash', hashToken(token))
    .maybeSingle();

  if (channelError) {
    console.error('Error al validar el canal de la Bandeja Automatica:', channelError);
    return NextResponse.json({ error: 'No se pudo validar el token.' }, { status: 500 });
  }
  if (!channel || !channel.is_active) {
    return NextResponse.json({ error: 'Token invalido, revocado, o inactivo.' }, { status: 401 });
  }

  let formData: FormData;
  try {
    formData = await request.formData();
  } catch {
    return NextResponse.json({ error: 'El cuerpo debe ser multipart/form-data, con un campo "file" o "text".' }, { status: 400 });
  }

  const { error: touchError } = await supabase
    .from('inbound_channels')
    .update({ last_used_at: new Date().toISOString() })
    .eq('id', channel.id);
  if (touchError) console.error('Error al actualizar last_used_at del canal entrante:', touchError);

  const file = formData.get('file');
  const text = formData.get('text');

  try {
    if (file instanceof File) {
      if (file.size === 0) {
        return NextResponse.json({ error: 'El archivo esta vacio.' }, { status: 400 });
      }
      if (file.size > MAX_FILE_SIZE_MB * 1024 * 1024) {
        return NextResponse.json({ error: `El archivo pesa mas de ${MAX_FILE_SIZE_MB}MB.` }, { status: 413 });
      }

      const originalFilename = file.name || 'documento';
      const storagePath = `${channel.space_id}/${randomUUID()}-${originalFilename}`;
      const fileBuffer = new Uint8Array(await file.arrayBuffer());

      const { error: uploadError } = await supabase.storage
        .from('receipts')
        .upload(storagePath, fileBuffer, { contentType: file.type || 'application/octet-stream', upsert: false });

      if (uploadError) {
        console.error('Error al subir el documento entrante:', uploadError);
        return NextResponse.json({ error: 'No se pudo guardar el archivo.' }, { status: 500 });
      }

      if (/\.xml$/i.test(originalFilename)) {
        const result = await processUblInvoiceWithClient(supabase, channel.created_by, channel.space_id, storagePath, originalFilename);
        return NextResponse.json(result, { status: result.success ? 201 : 422 });
      }

      const result = await processCaptureWithClient(supabase, channel.created_by, {
        space_id: channel.space_id,
        capture_source: sourceForMimeType(file.type || ''),
        storage_path: storagePath,
        mime_type: file.type || undefined,
        original_filename: originalFilename,
      });
      return NextResponse.json(result, { status: result.success ? 201 : 422 });
    }

    if (typeof text === 'string' && text.trim()) {
      const result = await processCaptureWithClient(supabase, channel.created_by, {
        space_id: channel.space_id,
        capture_source: 'ai_text',
        raw_text: text.trim(),
      });
      return NextResponse.json(result, { status: result.success ? 201 : 422 });
    }

    return NextResponse.json({ error: 'Falta el documento (campo "file") o el texto (campo "text").' }, { status: 400 });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await reportError({ source: 'inbound-webhook', message, stack: err instanceof Error ? err.stack : undefined, context: { spaceId: channel.space_id } });
    return NextResponse.json({ error: 'No se pudo procesar el documento.' }, { status: 500 });
  }
}
