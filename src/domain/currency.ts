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
