import { getSupabaseServerClient } from '@/infrastructure/supabase/server';

/**
 * Helpers compartidos por los proveedores de IA para leer una imagen ya
 * subida a Supabase Storage. Los modelos de vision de OpenAI aceptan una URL
 * firmada directamente; Anthropic y Gemini requieren los bytes en base64.
 * Ambos casos rechazan documentos no-imagen (PDF crudo) — se procesan solo
 * con el texto/transcripcion disponible.
 */

function isImage(mimeType?: string): boolean {
  return Boolean(mimeType?.startsWith('image/'));
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

  const url = await getSignedImageUrl(storagePath, mimeType);
  if (!url) return null;

  try {
    const response = await fetch(url);
    if (!response.ok) {
      console.error('No se pudo descargar la imagen para codificarla en base64:', response.status);
      return null;
    }
    const buffer = Buffer.from(await response.arrayBuffer());
    return { base64: buffer.toString('base64'), mimeType: mimeType ?? 'image/jpeg' };
  } catch (err) {
    console.error('Error descargando/codificando la imagen para el proveedor de IA:', err);
    return null;
  }
}
