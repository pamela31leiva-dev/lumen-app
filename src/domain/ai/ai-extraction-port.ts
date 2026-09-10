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
  /**
   * Clarificaciones previas que un usuario de este espacio ya respondio
   * (ver `classification_hints`), para que la IA aplique el mismo criterio
   * sin volver a preguntar. Cada string es un resumen "pregunta -> respuesta".
   * Opcional: los proveedores que no lo usen simplemente lo ignoran.
   */
  learnedHints?: string[];
  /** Nombre del espacio donde el usuario esta capturando ahora mismo. */
  activeSpaceName?: string;
  /**
   * Nombres de los OTROS espacios del usuario (Personal/Familiar/Negocio/
   * Proyecto), para que la IA pueda detectar si el texto pertenece
   * claramente a uno de ellos en vez de al activo. [] o ausente si el
   * usuario solo tiene un espacio.
   */
  otherSpaceNames?: string[];
}

export interface AiExtractionPort {
  extract(input: AiExtractionInput): Promise<AiExtractionResult>;
}
