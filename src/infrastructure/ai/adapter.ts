import type { AiExtractionPort } from '@/domain/ai/ai-extraction-port';
import { MockAiExtractionProvider } from '@/infrastructure/ai/providers/mock-provider';
import { OpenAiExtractionProvider } from '@/infrastructure/ai/providers/openai-provider';
import { AnthropicExtractionProvider } from '@/infrastructure/ai/providers/anthropic-provider';
import { GeminiExtractionProvider } from '@/infrastructure/ai/providers/gemini-provider';
import { ResilientAiExtractionProvider } from '@/infrastructure/ai/providers/resilient-provider';

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
      // Modo $0: Google Gemini directo (nivel gratuito de Google AI
      // Studio), sin depender de un motor de pago.
      cachedAdapter = new GeminiExtractionProvider();
      break;
    case 'anthropic':
      // Motor principal (Claude, de pago) + respaldo automatico (Gemini)
      // si el principal falla. GeminiExtractionProvider solo se
      // construye (y exige GEMINI_API_KEY) si realmente se necesita.
      cachedAdapter = new ResilientAiExtractionProvider(
        new AnthropicExtractionProvider(),
        () => new GeminiExtractionProvider(),
      );
      break;
    default:
      throw new Error(
        `AI_PROVIDER="${provider}" no tiene un adaptador registrado. Implementa AiExtractionPort y registralo en infrastructure/ai/adapter.ts.`,
      );
  }

  return cachedAdapter;
}
