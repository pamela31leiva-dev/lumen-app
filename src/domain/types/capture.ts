/**
 * Contratos del flujo de captura -> confirmacion.
 * Estos tipos son la fuente de verdad compartida entre Server Actions,
 * adaptadores de IA y componentes de presentacion. No dependen de Supabase
 * ni de Next.js: son el vocabulario del dominio.
 *
 * Deben mantenerse alineados con supabase/migrations/0001_init_schema.sql.
 */

export type TransactionType = 'income' | 'expense' | 'transfer';

export type RecordStatus = 'pending_confirmation' | 'confirmed' | 'rejected' | 'archived';

/** Fuentes de captura reconocidas por la base de datos (columna capture_source / source). */
export type CaptureSource =
  | 'manual'
  | 'ai_text'
  | 'ai_voice'
  | 'ai_photo'
  | 'ai_document'
  | 'import'
  | 'telegram';

/** Subconjunto de fuentes que efectivamente pasan por el motor de IA. */
export type AiCaptureSource = Extract<CaptureSource, 'ai_text' | 'ai_voice' | 'ai_photo' | 'ai_document'>;

/**
 * Resultado de la interpretacion de IA sobre una entrada no estructurada.
 * Es una PROPUESTA: nunca se persiste como verdad confirmada hasta que el
 * usuario pasa por el flujo de `confirmTransaction`.
 */
export interface AiExtractionResult {
  type: TransactionType | null;
  amount_original: number | null;
  currency_original: string | null;
  merchant_name: string | null;
  concept: string | null;
  category_suggestion_name: string | null;
  suggested_account_id: string | null;
  transaction_date: string | null; // ISO 8601
  /** 0 (sin confianza) a 1 (certeza total). Nunca en escala 0-100. */
  confidence_score: number;
  /** Campos que la IA no pudo determinar con certeza y requieren revision humana. */
  uncertainties: string[];
  /**
   * Pregunta corta para el usuario cuando la entrada es genuinamente
   * ambigua entre dos clasificaciones plausibles (ej. una categoria
   * recurrente que historicamente se ha dividido entre dos propositos
   * distintos). null cuando no hace falta preguntar nada.
   */
  clarification_question: string | null;
}

/** Payload para iniciar una captura (texto libre, transcripcion de voz, o documento ya subido a Storage). */
export interface CreatePendingCaptureDTO {
  space_id: string;
  capture_source: AiCaptureSource;
  /** Texto libre o transcripcion (ai_text / ai_voice). */
  raw_text?: string;
  /** Ruta en Supabase Storage del archivo ya subido (ai_photo / ai_document). */
  storage_path?: string;
  mime_type?: string;
  original_filename?: string;
}

export type ProcessCaptureResult =
  | {
      success: true;
      receiptId: string | null;
      transactionId: string;
      confidenceScore: number;
      /** true si el usuario debe revisar antes de que esto se pueda confirmar tal cual. */
      needsReview: boolean;
      uncertainties: string[];
    }
  | { success: false; error: string };

/** Payload para que la persona confirme (y corrija) una transaccion pendiente. */
export interface ConfirmTransactionDTO {
  transaction_id: string;
  space_id: string;
  type: TransactionType;
  account_id: string;
  destination_account_id?: string | null;
  category_id?: string | null;
  amount_original: number;
  currency_original: string;
  exchange_rate: number;
  description?: string | null;
  transaction_date: string; // ISO 8601
  receipt_id?: string | null;
}

export type ConfirmTransactionResult =
  | { success: true; transaction: Record<string, unknown> }
  | { success: false; error: string };
