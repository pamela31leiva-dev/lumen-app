import type { AiCaptureSource, AiExtractionResult } from '@/domain/types/capture';

/**
 * Puerto (interfaz) que desacopla el nucleo del producto de cualquier
 * proveedor concreto de OCR / Speech-to-Text / LLM. La capa de
 * infraestructura implementa esto; el resto de la app solo conoce este
 * contrato (Adapter Pattern exigido por el stack objetivo).
 */
export interface AiExtractionInput {
  source: AiCaptureSource;
  /** Texto libre o transcripcion ya obtenida (ai_text / ai_voice). */
  text?: string;
  /** Ruta en Supabase Storage del archivo a interpretar (ai_photo / ai_document). */
  storagePath?: string;
  mimeType?: string;
  /** Moneda base del espacio, usada como default cuando la IA no detecta una moneda explicita. */
  baseCurrency: string;
}

export interface AiExtractionPort {
  extract(input: AiExtractionInput): Promise<AiExtractionResult>;
}
