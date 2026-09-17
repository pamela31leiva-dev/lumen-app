/**
 * Lista curada de monedas soportadas -- no es una validacion estricta (el
 * backend acepta cualquier char(3) que el usuario escriba, igual que
 * currency_original desde 0001), solo las opciones que se ofrecen en los
 * selectores para no exigir que la persona recuerde codigos ISO 4217.
 */
export const SUPPORTED_CURRENCIES = [
  { code: 'COP', label: 'COP -- Peso colombiano' },
  { code: 'USD', label: 'USD -- Dolar estadounidense' },
  { code: 'EUR', label: 'EUR -- Euro' },
  { code: 'MXN', label: 'MXN -- Peso mexicano' },
  { code: 'BRL', label: 'BRL -- Real brasileno' },
  { code: 'ARS', label: 'ARS -- Peso argentino' },
  { code: 'CLP', label: 'CLP -- Peso chileno' },
  { code: 'PEN', label: 'PEN -- Sol peruano' },
  { code: 'GBP', label: 'GBP -- Libra esterlina' },
  { code: 'CAD', label: 'CAD -- Dolar canadiense' },
] as const;

export type SupportedCurrencyCode = (typeof SUPPORTED_CURRENCIES)[number]['code'];

export const CURRENCY_OPTIONS = SUPPORTED_CURRENCIES.map((c) => ({ value: c.code, label: c.label }));

/**
 * Redondeo monetario a 2 decimales sin el error de representacion binaria
 * clasico de `Math.round(x * 100) / 100` (ej. 1.005 * 100 puede llegar como
 * 100.49999999999999 en punto flotante y redondear 1 centavo para abajo,
 * silenciosamente). toFixed hace el redondeo sobre la representacion
 * decimal en texto del numero, no sobre su binario -- evita esa clase de
 * error para valores monetarios normales (hallazgo de la Auditoria P9).
 * Solo para totales client/server-side ya EXHIBIDOS como aproximados (ej.
 * conversion de activos alternativos) -- toda cifra contable real sigue
 * viviendo en columnas numeric de Postgres, nunca en aritmetica de JS.
 */
export function roundMoney(value: number): number {
  return Number(value.toFixed(2));
}
