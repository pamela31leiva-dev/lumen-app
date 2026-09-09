import { GoogleGenerativeAI, SchemaType, type Part } from '@google/generative-ai';
import type { AiExtractionInput, AiExtractionPort } from '@/domain/ai/ai-extraction-port';
import type { AiExtractionResult, TransactionType } from '@/domain/types/capture';
import { EXTRACTION_SYSTEM_PROMPT } from '@/domain/ai/system-prompt';
import { getImageAsBase64 } from '@/infrastructure/ai/shared/resolve-image';

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
    if (input.text) instructionLines.push(`Texto o transcripcion del usuario:\n"""${input.text}"""`);
    if (input.storagePath && !input.text) {
      instructionLines.push('El usuario adjunto un documento; interpretalo a partir de la imagen incluida.');
    }
    parts.push({ text: instructionLines.join('\n') });

    if (input.storagePath) {
      const image = await getImageAsBase64(input.storagePath, input.mimeType);
      if (image) {
        parts.push({ inlineData: { mimeType: image.mimeType, data: image.base64 } });
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
    };
  }

  /**
   * El nivel gratuito de Gemini devuelve 503 ("high demand") con
   * frecuencia visible en produccion — no es un error del usuario ni del
   * codigo. Reintenta hasta 2 veces con backoff corto antes de propagar,
   * para que una sola captura no falle por un pico transitorio de Google.
   */
  private async generateWithRetry(
    model: ReturnType<GoogleGenerativeAI['getGenerativeModel']>,
    parts: Part[],
  ): ReturnType<typeof model.generateContent> {
    const maxAttempts = 3;
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      try {
        return await model.generateContent(parts);
      } catch (error) {
        const is503 = error instanceof Error && /503|overloaded|high demand/i.test(error.message);
        if (!is503 || attempt === maxAttempts) throw error;
        await new Promise((resolve) => setTimeout(resolve, attempt * 800));
      }
    }
    throw new Error('Gemini no respondio tras varios intentos.');
  }
}
