import { GoogleGenerativeAI, SchemaType, type Part } from '@google/generative-ai';
import type { AiExtractionInput, AiExtractionPort } from '@/domain/ai/ai-extraction-port';
import type { AiExtractionResult, TransactionType } from '@/domain/types/capture';
import { EXTRACTION_SYSTEM_PROMPT } from '@/domain/ai/system-prompt';
import { getGeminiInlineData } from '@/infrastructure/ai/shared/resolve-image';

const RESPONSE_SCHEMA = {
  type: SchemaType.OBJECT,
  properties: {
    amount_original: { type: SchemaType.NUMBER, nullable: true },
    currency: { type: SchemaType.STRING, description: 'Codigo ISO 4217 de 3 letras, ej. COP, USD.' },
    type: { type: SchemaType.STRING, format: 'enum', enum: ['income', 'expense', 'transfer'] },
    merchant_name: { type: SchemaType.STRING, nullable: true },
    concept: { type: SchemaType.STRING, nullable: true },
    category_suggestion: { type: SchemaType.STRING, nullable: true },
    confidence_score: { type: SchemaType.NUMBER },
    uncertainties: { type: SchemaType.ARRAY, items: { type: SchemaType.STRING } },
    clarification_question: { type: SchemaType.STRING, nullable: true },
    clarification_options: { type: SchemaType.ARRAY, items: { type: SchemaType.STRING } },
    suggested_tags: { type: SchemaType.ARRAY, items: { type: SchemaType.STRING } },
    suggested_space_name: { type: SchemaType.STRING, nullable: true },
    document_legibility_issue: { type: SchemaType.STRING, nullable: true },
    is_business: { type: SchemaType.BOOLEAN },
  },
  required: [
    'amount_original',
    'currency',
    'type',
    'merchant_name',
    'concept',
    'category_suggestion',
    'confidence_score',
    'uncertainties',
    'clarification_question',
    'clarification_options',
    'suggested_tags',
    'suggested_space_name',
    'document_legibility_issue',
    'is_business',
  ],
};

interface GeminiExtractionSchema {
  amount_original: number | null;
  currency: string;
  type: TransactionType;
  merchant_name: string | null;
  concept: string | null;
  category_suggestion: string | null;
  confidence_score: number;
  uncertainties: string[];
  clarification_question: string | null;
  clarification_options: string[];
  suggested_tags: string[];
  suggested_space_name: string | null;
  document_legibility_issue: string | null;
  is_business: boolean;
}

/**
 * Google Gemini via el SDK oficial — motor principal en modo $0
 * (AI_PROVIDER=gemini, nivel gratuito) o de respaldo automatico cuando
 * AnthropicExtractionProvider falla (AI_PROVIDER=anthropic, ver
 * ResilientAiExtractionProvider en adapter.ts). Modelo por defecto
 * "gemini-2.5-flash" — si Google vuelve a renombrar/retirar modelos,
 * `GEMINI_MODEL` permite apuntar a uno vigente sin tocar codigo.
 */
export class GeminiExtractionProvider implements AiExtractionPort {
  private readonly client: GoogleGenerativeAI;
  private readonly modelName: string;

  constructor() {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      throw new Error('GEMINI_API_KEY no esta configurada.');
    }
    this.client = new GoogleGenerativeAI(apiKey);
    // "gemini-flash-latest" es un alias que Google mantiene apuntando
    // siempre al modelo flash vigente — evita tener que perseguir numeros
    // de version que Google retira (probado en vivo: tanto
    // "gemini-1.5-flash" como "gemini-2.5-flash" ya devuelven 404 aunque
    // sigan listados en ListModels).
    this.modelName = process.env.GEMINI_MODEL || 'gemini-flash-latest';
  }

  async extract(input: AiExtractionInput): Promise<AiExtractionResult> {
    const model = this.client.getGenerativeModel({
      model: this.modelName,
      systemInstruction: EXTRACTION_SYSTEM_PROMPT,
      generationConfig: {
        temperature: 0,
        responseMimeType: 'application/json',
        responseSchema: RESPONSE_SCHEMA,
      },
    });

    const parts: Part[] = [];
    const instructionLines = [`Moneda base del espacio: ${input.baseCurrency}.`];
    if (input.activeSpaceName) {
      instructionLines.push(`Espacio activo: ${input.activeSpaceName}.`);
    }
    if (input.otherSpaceNames && input.otherSpaceNames.length > 0) {
      instructionLines.push(`Otros espacios del usuario: ${input.otherSpaceNames.join(', ')}.`);
    }
    if (input.learnedHints && input.learnedHints.length > 0) {
      instructionLines.push('Aprendizajes previos de este espacio (aplica el mismo criterio, no vuelvas a preguntar):');
      instructionLines.push(...input.learnedHints.map((hint) => `- ${hint}`));
    }
    if (input.text) instructionLines.push(`Texto o transcripcion del usuario:\n"""${input.text}"""`);
    if (input.storagePath && !input.text) {
      instructionLines.push(
        input.mimeType === 'application/pdf'
          ? 'El usuario adjunto un PDF (comprobante o factura); interpretalo a partir del documento incluido.'
          : 'El usuario adjunto una imagen (foto o captura de comprobante); interpretala a partir de la imagen incluida.',
      );
    }
    parts.push({ text: instructionLines.join('\n') });

    if (input.storagePath) {
      const document = await getGeminiInlineData(input.storagePath, input.mimeType);
      if (document) {
        parts.push({ inlineData: { mimeType: document.mimeType, data: document.base64 } });
      }
    }

    const result = await this.generateWithRetry(model, parts);
    const raw = result.response.text();
    if (!raw) {
      throw new Error('Gemini no devolvio contenido interpretable.');
    }

    const parsed = JSON.parse(raw) as GeminiExtractionSchema;

    return {
      type: parsed.type,
      amount_original: parsed.amount_original,
      currency_original: parsed.currency || input.baseCurrency,
      merchant_name: parsed.merchant_name,
      concept: parsed.concept,
      category_suggestion_name: parsed.category_suggestion,
      suggested_account_id: null,
      transaction_date: null,
      confidence_score: Math.min(1, Math.max(0, parsed.confidence_score)),
      uncertainties: parsed.uncertainties,
      clarification_question: parsed.clarification_question,
      clarification_options: parsed.clarification_options ?? [],
      suggested_tags: parsed.suggested_tags,
      suggested_space_name: parsed.suggested_space_name,
      document_legibility_issue: parsed.document_legibility_issue,
      is_business: Boolean(parsed.is_business),
    };
  }

  /**
   * El nivel gratuito de Gemini devuelve 503 ("high demand") con
   * frecuencia visible en produccion — no es un error del usuario ni del
   * codigo. Reintenta hasta 2 veces con backoff corto antes de propagar,
   * para que una sola captura no falle por un pico transitorio de Google.
   *
   * Cada intento tiene un timeout duro (ATTEMPT_TIMEOUT_MS): el SDK no
   * configura un timeout propio en su fetch interno, asi que sin esto una
   * conexion colgada del lado de Google podia dejar la captura "cargando"
   * indefinidamente — el boton de Registrar nunca se destrababa porque la
   * Server Action nunca resolvia. Con el timeout, un intento colgado falla
   * limpio, sigue al siguiente intento (o al mensaje de error final) en vez
   * de congelar la interfaz.
   */
  private async generateWithRetry(
    model: ReturnType<GoogleGenerativeAI['getGenerativeModel']>,
    parts: Part[],
  ): ReturnType<typeof model.generateContent> {
    const maxAttempts = 3;
    const ATTEMPT_TIMEOUT_MS = 20_000;

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      try {
        return await this.withTimeout(model.generateContent(parts), ATTEMPT_TIMEOUT_MS);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        const isRetryable = /503|overloaded|high demand|timed out/i.test(message);
        if (!isRetryable || attempt === maxAttempts) throw error;
        await new Promise((resolve) => setTimeout(resolve, attempt * 800));
      }
    }
    throw new Error('Gemini no respondio tras varios intentos.');
  }

  private withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error(`Gemini timed out tras ${ms}ms sin responder.`)), ms);
      promise.then(
        (value) => {
          clearTimeout(timer);
          resolve(value);
        },
        (error) => {
          clearTimeout(timer);
          reject(error);
        },
      );
    });
  }
}
