import type { AiExtractionInput, AiExtractionPort } from '@/domain/ai/ai-extraction-port';
import type { AiExtractionResult, TransactionType } from '@/domain/types/capture';

/**
 * Motor local determinista (ultraligero, sin red): patrones de lenguaje
 * natural en español para los verbos financieros mas comunes. Es el
 * respaldo de emergencia cuando el proveedor externo (Gemini) falla o se
 * demora -- nunca el motor principal. Nunca inventa un monto, fecha, cuenta
 * o categoria que el texto no diga con claridad: cuando algo no se puede
 * determinar, queda en null/[] y se reporta en `uncertainties`, para que la
 * tarjeta de confirmacion pida esa informacion en vez de adivinarla.
 *
 * Deliberadamente NO intenta interpretar fotos ni documentos (eso exige
 * OCR/vision, imposible sin un modelo) -- solo actua sobre `input.text`.
 */

const EXPENSE_VERBS = /\b(gast[eé]|pagu[eé]|compr[eé]|cancel[eé])\b/i;
const INCOME_VERBS = /\b(recib[ií]|cobr[eé]|me\s+pagaron|me\s+consignaron|me\s+deposit(?:aron)?|ingres[oó]|gan[eé])\b/i;
const TRANSFER_VERBS = /\b(transfer[ií]|mov[ií]|pas[eé])\b/i;
// Union de los tres para poder "restar" el verbo del texto al aislar el concepto.
const ANY_VERB = /\b(gast[eé]|pagu[eé]|compr[eé]|cancel[eé]|recib[ií]|cobr[eé]|me\s+pagaron|me\s+consignaron|me\s+deposit(?:aron)?|ingres[oó]|gan[eé]|transfer[ií]|mov[ií]|pas[eé])\b/i;

// Numero con o sin separador de miles (punto) o decimales (coma) -- formato
// colombiano tipico: "25.000", "2.300.000", "40000", "15,5".
const AMOUNT_PATTERN = /\$?\s?(\d{1,3}(?:[.,]\d{3})+(?:[.,]\d{1,2})?|\d+(?:[.,]\d{1,2})?)/;

const YESTERDAY_PATTERN = /\bayer\b/i;

function parseColombianAmount(raw: string): number | null {
  const cleaned = raw.replace(/\$/g, '').trim();
  if (!cleaned) return null;

  const hasDot = cleaned.includes('.');
  const hasComma = cleaned.includes(',');

  if (hasDot && hasComma) {
    // Formato es-CO: punto = miles, coma = decimales ("2.300.000,50").
    const value = Number(cleaned.replace(/\./g, '').replace(',', '.'));
    return Number.isFinite(value) ? value : null;
  }

  if (hasDot) {
    const parts = cleaned.split('.');
    const last = parts[parts.length - 1];
    // Grupo final de 3 digitos con mas de un grupo => separador de miles ("25.000").
    if (parts.length > 1 && last.length === 3) {
      const value = Number(cleaned.replace(/\./g, ''));
      return Number.isFinite(value) ? value : null;
    }
    const value = Number(cleaned);
    return Number.isFinite(value) ? value : null;
  }

  if (hasComma) {
    const parts = cleaned.split(',');
    const last = parts[parts.length - 1];
    if (parts.length > 1 && last.length === 3) {
      const value = Number(cleaned.replace(/,/g, ''));
      return Number.isFinite(value) ? value : null;
    }
    const value = Number(cleaned.replace(',', '.'));
    return Number.isFinite(value) ? value : null;
  }

  const value = Number(cleaned);
  return Number.isFinite(value) ? value : null;
}

function detectType(text: string): TransactionType | null {
  if (TRANSFER_VERBS.test(text)) return 'transfer';
  if (INCOME_VERBS.test(text)) return 'income';
  if (EXPENSE_VERBS.test(text)) return 'expense';
  return null;
}

function extractTransferAccounts(text: string): { from: string | null; to: string | null } {
  const match = text.match(/\bde\s+(.+?)\s+(?:a|al)\s+(.+)$/i);
  if (!match) return { from: null, to: null };
  return {
    from: match[1].trim().replace(/[.,;]+$/, ''),
    to: match[2].trim().replace(/[.,;]+$/, ''),
  };
}

/**
 * Concepto/comercio: en vez de asumir un orden fijo ("verbo monto en
 * concepto"), se le RESTA al texto el verbo detectado y el monto ya
 * encontrado -- lo que sobra es el concepto, sin importar si la frase lo
 * pone antes o despues del monto ("compre medicamentos POR 40.000" vs
 * "gaste 25.000 EN mercado" vs "pague la matricula del colegio 800.000",
 * sin preposicion alguna). Para transferencias, el concepto util es el par
 * origen/destino, no el resto de la frase.
 */
function extractConcept(text: string, type: TransactionType, amountMatch: RegExpMatchArray): string | null {
  if (type === 'transfer') {
    const { from, to } = extractTransferAccounts(text);
    return from && to ? `${from} -> ${to}` : null;
  }

  const index = amountMatch.index ?? 0;
  const matched = amountMatch[0];
  let remainder = text.slice(0, index) + text.slice(index + matched.length);
  remainder = remainder.replace(ANY_VERB, ' ');
  remainder = remainder.replace(/^\s*(en|de|del|por|la|el|los|las)\s+/i, ' ');
  remainder = remainder.replace(/\s+(en|de|del|por)\s*$/i, ' ');
  remainder = remainder.replace(/\s+/g, ' ').trim();
  remainder = remainder.replace(/^[.,;]+|[.,;]+$/g, '').trim();
  return remainder.length > 0 ? remainder : null;
}

export class LocalRegexExtractionProvider implements AiExtractionPort {
  async extract(input: AiExtractionInput): Promise<AiExtractionResult> {
    const text = input.text?.trim();
    if (!text) {
      // Sin texto (foto/documento): este motor no puede hacer OCR ni vision,
      // asi que no finge un resultado -- deja que el llamador lo trate como
      // fallo total y conserve la entrada original para revision manual.
      throw new Error('El motor local solo interpreta texto; esta entrada no trae texto que analizar.');
    }

    const type = detectType(text);
    const amountMatch = text.match(AMOUNT_PATTERN);
    const amount = amountMatch ? parseColombianAmount(amountMatch[1]) : null;

    if (!type || amount === null || !amountMatch) {
      throw new Error('El motor local no reconocio un patron de movimiento financiero en este texto.');
    }

    const uncertainties: string[] = [];
    const concept = extractConcept(text, type, amountMatch);
    if (!concept) uncertainties.push('descripcion');
    uncertainties.push('categoria', 'cuenta');

    let clarificationQuestion: string | null = null;
    let clarificationOptions: string[] = [];

    if (type === 'transfer') {
      const { from, to } = extractTransferAccounts(text);
      if (!from || !to) {
        clarificationQuestion = '¿Entre que cuentas fue esta transferencia?';
      }
    }

    const isYesterday = YESTERDAY_PATTERN.test(text);
    const transactionDate = isYesterday ? new Date(Date.now() - 86_400_000).toISOString() : new Date().toISOString();

    return {
      type,
      amount_original: amount,
      currency_original: input.baseCurrency,
      merchant_name: null,
      concept,
      category_suggestion_name: null,
      suggested_account_id: null,
      transaction_date: transactionDate,
      // Deliberadamente moderada: este motor reconoce el patron con
      // confianza, pero nunca tanta como un modelo de lenguaje real -- la
      // tarjeta de confirmacion debe seguir sintiendose como "revisa esto",
      // no "ya quedo listo".
      confidence_score: 0.55,
      uncertainties,
      clarification_question: clarificationQuestion,
      clarification_options: clarificationOptions,
      suggested_tags: [],
      suggested_space_name: null,
      document_legibility_issue: null,
      // Nunca declara negocio/carpeta por su cuenta -- el motor de
      // inferencia por palabras clave e historial (capture.ts) ya cubre
      // esa señal como una segunda capa, independiente del proveedor que
      // haya generado la extraccion base.
      is_business: false,
      life_domain: null,
    };
  }
}
