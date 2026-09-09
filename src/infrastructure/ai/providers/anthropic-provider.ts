import Anthropic from '@anthropic-ai/sdk';
import type { AiExtractionInput, AiExtractionPort } from '@/domain/ai/ai-extraction-port';
import type { AiExtractionResult, TransactionType } from '@/domain/types/capture';
import { EXTRACTION_SYSTEM_PROMPT } from '@/domain/ai/system-prompt';
import { getImageAsBase64 } from '@/infrastructure/ai/shared/resolve-image';

/**
 * Tool-use fuerza a Claude a devolver el resultado con esta forma exacta
 * (equivalente al Structured Outputs de OpenAI, pero con el mecanismo propio
 * de Anthropic). El nombre de la tool no importa mas alla de referenciarlo
 * en tool_choice.
 */
const EXTRACTION_TOOL: Anthropic.Tool = {
  name: 'record_extraction',
  description: 'Registra la interpretacion estructurada de un movimiento financiero.',
  input_schema: {
    type: 'object',
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
};

interface ExtractionToolInput {
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
 * Motor principal de extraccion: Claude 3.5 Haiku via el SDK oficial de
 * Anthropic. Usado por adapter.ts dentro de ResilientAiExtractionProvider,
 * con Gemini como respaldo automatico si esto falla.
 */
export class AnthropicExtractionProvider implements AiExtractionPort {
  private readonly client: Anthropic;
  private readonly model: string;

  constructor() {
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      throw new Error('ANTHROPIC_API_KEY no esta configurada.');
    }
    this.client = new Anthropic({ apiKey });
    this.model = process.env.ANTHROPIC_MODEL || 'claude-3-5-haiku-20241022';
  }

  async extract(input: AiExtractionInput): Promise<AiExtractionResult> {
    const content: Array<Anthropic.TextBlockParam | Anthropic.ImageBlockParam> = [];

    const instructionLines = [`Moneda base del espacio: ${input.baseCurrency}.`];
    if (input.text) instructionLines.push(`Texto o transcripcion del usuario:\n"""${input.text}"""`);
    if (input.storagePath && !input.text) {
      instructionLines.push('El usuario adjunto un documento; interpretalo a partir de la imagen incluida.');
    }
    content.push({ type: 'text', text: instructionLines.join('\n') });

    if (input.storagePath) {
      const image = await getImageAsBase64(input.storagePath, input.mimeType);
      if (image) {
        content.push({
          type: 'image',
          source: {
            type: 'base64',
            media_type: image.mimeType as 'image/jpeg' | 'image/png' | 'image/gif' | 'image/webp',
            data: image.base64,
          },
        });
      }
    }

    const message = await this.client.messages.create({
      model: this.model,
      max_tokens: 1024,
      temperature: 0,
      system: EXTRACTION_SYSTEM_PROMPT,
      tools: [EXTRACTION_TOOL],
      tool_choice: { type: 'tool', name: 'record_extraction' },
      messages: [{ role: 'user', content }],
    });

    const toolUse = message.content.find((block): block is Anthropic.ToolUseBlock => block.type === 'tool_use');
    if (!toolUse) {
      throw new Error('Claude no devolvio una extraccion estructurada.');
    }

    const parsed = toolUse.input as ExtractionToolInput;

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
}
