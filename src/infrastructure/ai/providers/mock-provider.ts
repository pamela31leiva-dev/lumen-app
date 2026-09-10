import type { AiExtractionPort, AiExtractionInput } from '@/domain/ai/ai-extraction-port';
import type { AiExtractionResult } from '@/domain/types/capture';

/**
 * Proveedor de IA determinista para desarrollo local y pruebas, sin
 * dependencias externas ni costo. Implementa el mismo puerto que usaran los
 * proveedores reales (OpenAI, Anthropic, Google Vision, etc.), por lo que
 * cambiar de proveedor no requiere tocar `actions/capture.ts`.
 *
 * Extrae un monto en pesos (con puntos o comas como separador de miles) del
 * texto cuando existe, y baja la confianza cuando la entrada es ambigua.
 */
export class MockAiExtractionProvider implements AiExtractionPort {
  async extract(input: AiExtractionInput): Promise<AiExtractionResult> {
    const text = input.text ?? '';
    const amountMatch = text.match(/(\d{1,3}(?:[.,]\d{3})*|\d+)(?:[.,](\d{2}))?/);
    const amount = amountMatch ? Number(amountMatch[0].replace(/[.,](?=\d{3})/g, '')) : null;

    const looksLikeIncome = /\b(pago recibido|me pagaron|salario|ingreso)\b/i.test(text);
    const uncertainties: string[] = [];

    if (amount === null) uncertainties.push('amount_original');
    if (!input.text && !input.storagePath) uncertainties.push('source_content');

    return {
      type: looksLikeIncome ? 'income' : 'expense',
      amount_original: amount,
      currency_original: input.baseCurrency,
      merchant_name: null,
      concept: text ? text.slice(0, 120) : null,
      category_suggestion_name: null,
      suggested_account_id: null,
      transaction_date: null,
      confidence_score: amount !== null ? 0.6 : 0.2,
      uncertainties,
      clarification_question: null,
      clarification_options: [],
      suggested_tags: [],
      suggested_space_name: null,
    };
  }
}
