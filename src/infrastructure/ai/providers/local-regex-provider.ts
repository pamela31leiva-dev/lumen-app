import type { AiExtractionInput, AiExtractionPort } from '@/domain/ai/ai-extraction-port';
import type { AiExtractionResult, TransactionType } from '@/domain/types/capture';

/**
 * Motor local determinista (ultraligero, sin red): patrones de lenguaje
 * natural y numerico en español. Es el motor LOCAL-FIRST -- corre antes que
 * cualquier proveedor externo (ver adapter.ts), para que un registro
 * numerico simple se resuelva en milisegundos sin esperar a Gemini. Solo
 * cuando este motor no encuentra ningun monto reconocible se recurre a la
 * IA externa. Nunca inventa cuenta, categoria o carpeta que el texto no
 * diga con claridad: cuando algo no se puede determinar, queda en null/[] y
 * se reporta en `uncertainties`, para que la tarjeta de confirmacion la
 * pida en vez de adivinarla.
 *
 * Deliberadamente NO intenta interpretar fotos ni documentos (eso exige
 * OCR/vision, imposible sin un modelo) -- solo actua sobre `input.text`.
 */

const EXPENSE_VERBS = /\b(gast[eé]|pagu[eé]|compr[eé]|cancel[eé])\b/i;
const INCOME_VERBS = /\b(recib[ií]|cobr[eé]|me\s+pagaron|me\s+consignaron|me\s+deposit(?:aron)?|ingres[oó]|gan[eé])\b/i;
const TRANSFER_VERBS = /\b(transfer[ií]|mov[ií]|pas[eé])\b/i;
// Union de los tres para poder "restar" el verbo del texto al aislar el concepto.
const ANY_VERB = /\b(gast[eé]|pagu[eé]|compr[eé]|cancel[eé]|recib[ií]|cobr[eé]|me\s+pagaron|me\s+consignaron|me\s+deposit(?:aron)?|ingres[oó]|gan[eé]|transfer[ií]|mov[ií]|pas[eé])\b/i;

const YESTERDAY_PATTERN = /\bayer\b/i;

interface AmountMatch {
  value: number;
  matchText: string;
  index: number;
}

function parseSimpleNumber(raw: string): number | null {
  const value = Number(raw.replace(',', '.'));
  return Number.isFinite(value) ? value : null;
}

/** "23 900", "1.200.000", "1.200.000,50" -- cada grupo separado por punto/espacio tiene exactamente 3 digitos. */
function parseGroupedNumber(raw: string): number | null {
  const decimalMatch = raw.match(/,(\d{1,2})$/);
  const integerPart = decimalMatch ? raw.slice(0, raw.length - decimalMatch[0].length) : raw;
  const digitsOnly = integerPart.replace(/[.\s]/g, '');
  const value = Number(decimalMatch ? `${digitsOnly}.${decimalMatch[1]}` : digitsOnly);
  return Number.isFinite(value) ? value : null;
}

/**
 * Formatos cotidianos colombianos, probados EN ESTE ORDEN (mas especifico
 * primero) y con el primer match ganador -- evita aplicar un multiplicador
 * dos veces: "40 mil"/"4000 mil"/"40 lucas" (x1000), "4k" (x1000), numeros
 * agrupados por punto o espacio ("23 900", "1.200.000"), y por ultimo un
 * numero plano ("45000").
 */
function findAmount(text: string): AmountMatch | null {
  let match = text.match(/\$?\s?(\d+(?:[.,]\d+)?)\s*(mil|lucas)\b/i);
  if (match) {
    const base = parseSimpleNumber(match[1]);
    if (base !== null) return { value: base * 1000, matchText: match[0], index: match.index ?? 0 };
  }

  match = text.match(/\$?\s?(\d+(?:[.,]\d+)?)\s*k\b/i);
  if (match) {
    const base = parseSimpleNumber(match[1]);
    if (base !== null) return { value: base * 1000, matchText: match[0], index: match.index ?? 0 };
  }

  match = text.match(/\$?\s?(\d{1,3}(?:[.\s]\d{3})+(?:,\d{1,2})?)/);
  if (match) {
    const value = parseGroupedNumber(match[1]);
    if (value !== null) return { value, matchText: match[0], index: match.index ?? 0 };
  }

  match = text.match(/\$?\s?(\d+(?:[.,]\d{1,2})?)/);
  if (match) {
    const value = parseSimpleNumber(match[1]);
    if (value !== null) return { value, matchText: match[0], index: match.index ?? 0 };
  }

  return null;
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
 * Concepto/comercio: se le RESTA al texto el verbo detectado (si hay) y el
 * monto ya encontrado -- lo que sobra es el concepto, sin importar si la
 * frase lo pone antes o despues del monto, o si no hay verbo en absoluto
 * (un numero suelto como "23.900" nunca deja un concepto util, y eso esta
 * bien: queda null en vez de forzar la frase completa como descripcion).
 */
function extractConcept(text: string, type: TransactionType, amountMatch: AmountMatch): string | null {
  if (type === 'transfer') {
    const { from, to } = extractTransferAccounts(text);
    return from && to ? `${from} -> ${to}` : null;
  }

  let remainder = text.slice(0, amountMatch.index) + text.slice(amountMatch.index + amountMatch.matchText.length);
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
      // asi que no finge un resultado -- deja que el llamador recurra a la
      // IA externa (unica opcion real para ese tipo de entrada).
      throw new Error('El motor local solo interpreta texto; esta entrada no trae texto que analizar.');
    }

    const amountMatch = findAmount(text);
    if (!amountMatch) {
      // Sin ningun monto reconocible, este motor no tiene nada solido que
      // proponer -- se recurre a la IA externa en vez de adivinar un numero.
      throw new Error('El motor local no encontro un monto reconocible en este texto.');
    }

    const detectedType = detectType(text);
    // "No rechaces una entrada solo porque no contiene un verbo": un monto
    // claro sin verbo se propone como Gasto (el caso mas comun), marcado
    // como incierto para que la tarjeta de confirmacion lo confirme o
    // corrija en un toque -- nunca un error tecnico.
    const type = detectedType ?? 'expense';
    const hadVerb = detectedType !== null;

    const uncertainties: string[] = [];
    if (!hadVerb) uncertainties.push('tipo');

    const concept = extractConcept(text, type, amountMatch);
    if (!concept) uncertainties.push('descripcion');
    uncertainties.push('categoria', 'cuenta');

    let clarificationQuestion: string | null = null;
    const clarificationOptions: string[] = [];

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
      amount_original: amountMatch.value,
      currency_original: input.baseCurrency,
      merchant_name: null,
      concept,
      category_suggestion_name: null,
      suggested_account_id: null,
      transaction_date: transactionDate,
      // Deliberadamente moderada: este motor reconoce el patron con
      // confianza, pero nunca tanta como un modelo de lenguaje real -- mas
      // baja aun cuando tuvo que adivinar el tipo por falta de verbo. La
      // tarjeta de confirmacion debe seguir sintiendose como "revisa esto",
      // no "ya quedo listo".
      confidence_score: hadVerb ? 0.6 : 0.4,
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
