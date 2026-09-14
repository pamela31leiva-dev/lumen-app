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
      // Modo $0: Google Gemini (nivel gratuito de Google AI Studio) como
      // motor principal, con el motor local determinista (regex, sin red)
      // como respaldo automatico -- antes, si Gemini fallaba o se demoraba
      // (confirmado en produccion: reintentos agotados a los ~30s), la
      // captura simplemente fallaba sin alternativa. Ahora un patron comun
      // en español ("Gaste 25.000 en mercado") se resuelve localmente en
      // milisegundos aunque Gemini este caido.
      cachedAdapter = new ResilientAiExtractionProvider(new GeminiExtractionProvider(), () => new LocalRegexExtractionProvider());
      break;
    case 'anthropic':
      // Cadena de 3 niveles: Claude (principal, de pago) -> Gemini
      // (respaldo externo) -> motor local determinista (ultimo respaldo,
      // sin red). Cada nivel solo se construye si el anterior realmente
      // fallo, asi que Gemini/el motor local nunca se instancian si Claude
      // ya respondio bien.
      cachedAdapter = new ResilientAiExtractionProvider(
        new AnthropicExtractionProvider(),
        () => new ResilientAiExtractionProvider(new GeminiExtractionProvider(), () => new LocalRegexExtractionProvider()),
      );
      break;
    default:
      throw new Error(
        `AI_PROVIDER="${provider}" no tiene un adaptador registrado. Implementa AiExtractionPort y registralo en infrastructure/ai/adapter.ts.`,
      );
  }

  return cachedAdapter;
}
