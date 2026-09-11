import type { TransactionType } from '@/domain/types/capture';

/**
 * Evento del DOM que conecta la confirmacion de una transaccion (en
 * PendingConfirmationCard, dentro del feed de acciones) con el destello
 * visual del Hero de balance (en otra rama del arbol de componentes). Un
 * CustomEvent en window es deliberadamente mas simple que un context/store
 * global para una sola señal efimera de "algo se acaba de confirmar".
 */
export const TRANSACTION_CONFIRMED_EVENT = 'lumen:transaction-confirmed';

/**
 * Frases breves de refuerzo positivo mostradas de inmediato al confirmar,
 * antes de que la mutacion real termine de viajar a Supabase -- "generadas
 * o simuladas" a proposito como una lista curada en vez de una llamada real
 * a un LLM: una microinteraccion que se dispara en cada confirmacion no
 * puede depender de latencia de red ni arriesgarse a que un modelo invente
 * algo raro. Si despues hay un insight real y mejor (ver actions/insights.ts),
 * este mensaje se reemplaza por ese; si no, esta frase se queda como esta.
 */
const CONFIRMATION_PHRASES: Record<TransactionType, string[]> = {
  expense: [
    'Tu liquidez respira tranquila.',
    'Radiografia al dia y sin sesgos.',
    'Un dato menos en la sombra.',
    'Tu espacio vuelve a estar en calma.',
    'Claridad, otra vez.',
  ],
  income: [
    'Tu flujo ya juega a tu favor.',
    'Entrada registrada. Cuentas mas claras.',
    'Tu liquidez respira tranquila.',
  ],
  transfer: ['Tus cuentas, sincronizadas.', 'Movimiento interno, todo en orden.'],
};

export function pickConfirmationPhrase(type: TransactionType): string {
  const options = CONFIRMATION_PHRASES[type];
  return options[Math.floor(Math.random() * options.length)];
}
