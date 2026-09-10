import { getSupabaseServerClient } from '@/infrastructure/supabase/server';

/**
 * Helpers compartidos por los proveedores de IA para leer un documento ya
 * subido a Supabase Storage. Los modelos de vision de OpenAI aceptan una URL
 * firmada directamente (solo imagen: OpenAI's image_url no acepta PDF);
 * Anthropic y Gemini requieren los bytes en base64.
 *
 * Gemini SI soporta PDF nativo como inlineData (lo trata como documento, no
 * como imagen) -- ver getGeminiInlineData mas abajo, usado solo por
 * GeminiExtractionProvider. getImageAsBase64 se queda estricto a imagen
 * porque Anthropic's image block rechaza cualquier media_type que no sea
 * imagen real; ampliarlo ahi mandaria un PDF disfrazado de imagen y Claude
 * lo rechazaria.
 */

function isImage(mimeType?: string): boolean {
  return Boolean(mimeType?.startsWith('image/'));
}

function isImageOrPdf(mimeType?: string): boolean {
  return isImage(mimeType) || mimeType === 'application/pdf';
}

export async function getSignedImageUrl(storagePath: string, mimeType?: string): Promise<string | null> {
  if (!isImage(mimeType)) return null;

  const supabase = await getSupabaseServerClient();
  const { data, error } = await supabase.storage.from('receipts').createSignedUrl(storagePath, 300);
  if (error || !data) {
    console.error('No se pudo firmar la imagen para enviarla al proveedor de IA:', error);
    return null;
  }
  return data.signedUrl;
}

export interface Base64Image {
  base64: string;
  mimeType: string;
}

export async function getImageAsBase64(storagePath: string, mimeType?: string): Promise<Base64Image | null> {
  if (!isImage(mimeType)) return null;
  return downloadAsBase64(storagePath, mimeType!);
}

/**
 * Igual que getImageAsBase64 pero tambien acepta application/pdf -- Gemini
 * procesa un PDF como inlineData directamente (su propio motor de vision le
 * hace OCR/extraccion, no hace falta convertirlo a imagen primero). Solo la
 * usa GeminiExtractionProvider.
 */
export async function getGeminiInlineData(storagePath: string, mimeType?: string): Promise<Base64Image | null> {
  if (!isImageOrPdf(mimeType)) return null;
  return downloadAsBase64(storagePath, mimeType!);
}

async function downloadAsBase64(storagePath: string, mimeType: string): Promise<Base64Image | null> {
  const supabase = await getSupabaseServerClient();
  const { data, error } = await supabase.storage.from('receipts').createSignedUrl(storagePath, 300);
  if (error || !data) {
    console.error('No se pudo firmar el documento para enviarlo al proveedor de IA:', error);
    return null;
  }

  try {
    const response = await fetch(data.signedUrl);
    if (!response.ok) {
      console.error('No se pudo descargar el documento para codificarlo en base64:', response.status);
      return null;
    }
    const buffer = Buffer.from(await response.arrayBuffer());
    return { base64: buffer.toString('base64'), mimeType };
  } catch (err) {
    console.error('Error descargando/codificando el documento para el proveedor de IA:', err);
    return null;
  }
}
