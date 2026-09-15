import type { AiExtractionPort } from '@/domain/ai/ai-extraction-port';
import { MockAiExtractionProvider } from '@/infrastructure/ai/providers/mock-provider';
import { OpenAiExtractionProvider } from '@/infrastructure/ai/providers/openai-provider';
import { AnthropicExtractionProvider } from '@/infrastructure/ai/providers/anthropic-provider';
import { GeminiExtractionProvider } from '@/infrastructure/ai/providers/gemini-provider';
import { ResilientAiExtractionProvider } from '@/infrastructure/ai/providers/resilient-provider';
import { LocalRegexExtractionProvider } from '@/infrastructure/ai/providers/local-regex-provider';

/**
 * Punto unico de seleccion de proveedor de IA. El resto de la aplicacion
 * (Server Actions, UI) solo conoce `AiExtractionPort`; agregar un proveedor
 * real (Anthropic, Google Document AI, etc.) significa:
 *   1. Crear la clase en `infrastructure/ai/providers/` implementando `AiExtractionPort`.
 *   2. Agregar un `case` aqui, mapeado a una variable de entorno.
 * Nunca se acopla el dominio ni las Server Actions a un SDK de IA especifico.
 */
let cachedAdapter: AiExtractionPort | null = null;

export function getAiExtractionAdapter(): AiExtractionPort {
  if (cachedAdapter) return cachedAdapter;

  const provider = process.env.AI_PROVIDER ?? 'mock';

  switch (provider) {
    case 'mock':
      cachedAdapter = new MockAiExtractionProvider();
      break;
    case 'openai':
      cachedAdapter = new OpenAiExtractionProvider();
      break;
    case 'gemini':
      // Local-first: el motor local determinista (regex, sin red) corre
      // SIEMPRE primero. Un monto claro ("45000", "23 900", "40 mil", "4k",
      // "gaste 25.000 en mercado") se resuelve en milisegundos sin tocar la
      // red. Gemini (nivel gratuito de Google AI Studio) solo se llama
      // cuando el motor local no encuentra ningun monto reconocible --
      // nunca al reves. Antes Gemini era el intento principal (hasta 3
      // reintentos de 9s = ~30s en el peor caso, confirmado en produccion)
      // y el motor local solo actuaba como respaldo tras ese fallo.
      cachedAdapter = new ResilientAiExtractionProvider(new LocalRegexExtractionProvider(), () => new GeminiExtractionProvider());
      break;
    case 'anthropic':
      // Local-first tambien aqui: el motor local corre antes que CUALQUIER
      // API externa. Solo si no encuentra un monto reconocible se recurre a
      // la cadena externa ya existente (Claude principal, de pago -> Gemini
      // como respaldo si Claude falla).
      cachedAdapter = new ResilientAiExtractionProvider(
        new LocalRegexExtractionProvider(),
        () => new ResilientAiExtractionProvider(new AnthropicExtractionProvider(), () => new GeminiExtractionProvider()),
      );
      break;
    default:
      throw new Error(
        `AI_PROVIDER="${provider}" no tiene un adaptador registrado. Implementa AiExtractionPort y registralo en infrastructure/ai/adapter.ts.`,
      );
  }

  return cachedAdapter;
}
