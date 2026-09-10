import OpenAI from 'openai';
import type { AiExtractionInput, AiExtractionPort } from '@/domain/ai/ai-extraction-port';
import type { AiExtractionResult, TransactionType } from '@/domain/types/capture';
import { EXTRACTION_SYSTEM_PROMPT } from '@/domain/ai/system-prompt';
import { getSignedImageUrl } from '@/infrastructure/ai/shared/resolve-image';

/**
 * Esquema JSON estricto (Structured Outputs) que el modelo debe devolver.
 * Los nombres de campo son el vocabulario "externo" del proveedor; se
 * traducen a AiExtractionResult (el vocabulario del dominio) en `extract()`.
 */
const RESPONSE_JSON_SCHEMA = {
  name: 'transaction_extraction',
  strict: true,
  schema: {
    type: 'object',
    additionalProperties: false,
    properties: {
      amount_original: { type: ['number', 'null'] },
      currency: { type: 'string', description: 'Codigo ISO 4217 de 3 letras, ej. COP, USD.' },
      type: { type: 'string', enum: ['income', 'expense', 'transfer'] },
      merchant_name: { type: ['string', 'null'] },
      concept: { type: ['string', 'null'] },
      category_suggestion: { type: ['string', 'null'] },
      confidence_score: { type: 'number', minimum: 0, maximum: 1 },
      uncertainties: { type: 'array', items: { type: 'string' } },
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
  },
} as const;

interface OpenAiExtractionSchema {
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
 * Implementacion real de AiExtractionPort usando el SDK oficial de OpenAI.
 * Compatible con OpenRouter (u otro endpoint compatible con la API de Chat
 * Completions de OpenAI) apuntando OPENAI_BASE_URL a su URL base.
 */
export class OpenAiExtractionProvider implements AiExtractionPort {
  private readonly client: OpenAI;
  private readonly model: string;

  constructor() {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      throw new Error('OPENAI_API_KEY no esta configurada. Definela en el entorno para usar AI_PROVIDER=openai.');
    }

    this.client = new OpenAI({ apiKey, baseURL: process.env.OPENAI_BASE_URL });
    this.model = process.env.OPENAI_MODEL || 'gpt-4o-mini';
  }

  async extract(input: AiExtractionInput): Promise<AiExtractionResult> {
    const content: OpenAI.Chat.Completions.ChatCompletionContentPart[] = [];

    const instructionLines = [`Moneda base del espacio: ${input.baseCurrency}.`];
    if (input.text) instructionLines.push(`Texto o transcripcion del usuario:\n"""${input.text}"""`);
    if (input.storagePath && !input.text) instructionLines.push('El usuario adjunto un documento; interpretalo a partir de la imagen incluida.');
    content.push({ type: 'text', text: instructionLines.join('\n') });

    if (input.storagePath) {
      const imageUrl = await getSignedImageUrl(input.storagePath, input.mimeType);
      if (imageUrl) {
        content.push({ type: 'image_url', image_url: { url: imageUrl } });
      }
    }

    const completion = await this.client.chat.completions.create({
      model: this.model,
      temperature: 0,
      messages: [
        { role: 'system', content: EXTRACTION_SYSTEM_PROMPT },
        { role: 'user', content },
      ],
      response_format: { type: 'json_schema', json_schema: RESPONSE_JSON_SCHEMA },
    });

    const raw = completion.choices[0]?.message?.content;
    if (!raw) {
      throw new Error('El proveedor de IA no devolvio contenido interpretable.');
    }

    const parsed = JSON.parse(raw) as OpenAiExtractionSchema;

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
      // Motor de pago sin uso activo en modo $0; la clarificacion
      // interactiva solo esta implementada en GeminiExtractionProvider.
      clarification_question: null,
    };
  }
}
