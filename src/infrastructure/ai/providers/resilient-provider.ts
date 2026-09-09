import type { AiExtractionInput, AiExtractionPort } from '@/domain/ai/ai-extraction-port';
import type { AiExtractionResult } from '@/domain/types/capture';
import { reportError } from '@/lib/telemetry/reporter';

/**
 * Motor principal + respaldo automatico: intenta `primary` (Anthropic
 * Claude); si falla por cualquier razon (llave invalida, rate limit,
 * timeout, modelo retirado, respuesta inesperada), reporta el fallo por
 * telemetria y reintenta inmediatamente con `fallback` (Gemini). Si ambos
 * fallan, propaga el error del fallback (processIncomingCapture ya sabe
 * convertir eso en un mensaje amigable para el usuario).
 *
 * `createFallback` es una fabrica (no una instancia) para que construir el
 * respaldo — y exigir su API key — solo ocurra si el principal realmente
 * fallo. Si Anthropic funciona siempre, Gemini nunca necesita estar configurado.
 */
export class ResilientAiExtractionProvider implements AiExtractionPort {
  constructor(
    private readonly primary: AiExtractionPort,
    private readonly createFallback: () => AiExtractionPort,
  ) {}

  async extract(input: AiExtractionInput): Promise<AiExtractionResult> {
    try {
      return await this.primary.extract(input);
    } catch (primaryError) {
      await reportError({
        source: 'ai-extraction-primary-failed',
        message: primaryError instanceof Error ? primaryError.message : String(primaryError),
        stack: primaryError instanceof Error ? primaryError.stack : undefined,
        context: { captureSource: input.source, hadImage: Boolean(input.storagePath) },
      });

      const fallback = this.createFallback();
      return fallback.extract(input);
    }
  }
}
