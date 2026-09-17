import type { LumenGuideMood } from '@/components/guide/LumenGuideAvatar';

/**
 * Guion de "Lumen Guide" (Fase 1 del plan de mejora): un solo lugar para
 * curar CADA frase que la mascota dice, con la misma voz que ya usa el
 * resto de la app -- calida, breve, en metaforas de luz/claridad (ver
 * lib/clarity-loop.ts), CERO jerga contable sin explicar. Nunca es un LLM
 * en vivo: son frases ya escritas y revisadas, la misma decision de diseño
 * que CONFIRMATION_PHRASES -- una mascota que en cualquier momento pudiera
 * "inventar" algo raro sobre la plata de alguien seria lo opuesto a
 * confianza.
 */
export interface LumenGuideMessage {
  id: string;
  mood: LumenGuideMood;
  title?: string;
  message: string;
}

export const GUIDE_MESSAGES = {
  /** Executive Board: el espacio todavia no tiene saldo inicial declarado (hasRealAssets=false). */
  netWorthEmpty: {
    id: 'net-worth-empty',
    mood: 'default',
    title: 'Antes de ver tu Patrimonio Neto',
    message:
      'Cuentame cuanto tienes hoy en cada cuenta (toca "Establecer saldo inicial" mas abajo) y desde ahi yo me encargo de mantenerlo al dia con cada movimiento que registres.',
  },
  /** Ajustes/Administracion > Clasificacion Tributaria: primera vez que se ve el glosario. */
  fiscalGlossaryIntro: {
    id: 'fiscal-glossary-intro',
    mood: 'thinking',
    title: 'No hace falta ser contador',
    message:
      'Estos 5 terminos suenan mas dificiles de lo que son -- los explique abajo en español sencillo. Si de verdad no sabes como clasificar algo, el boton "Aplicar sugerencias estandar" parte de un criterio razonable que despues puedes corregir.',
  },
  /** /movimientos: historial vacio. */
  movementsEmpty: {
    id: 'movements-empty',
    mood: 'default',
    title: 'Tu historial vive aqui',
    message: 'En cuanto confirmes tu primer movimiento (arriba en Panorama), va a aparecer en esta lista, ordenado y listo para repasar cuando quieras.',
  },
  /** Activos Alternativos: primera vez, seccion vacia. */
  alternativeAssetsEmpty: {
    id: 'alternative-assets-empty',
    mood: 'happy',
    title: 'Esto es aparte de tus cuentas',
    message: 'Inversiones, cripto o una propiedad no son un movimiento del dia a dia -- son algo que TIENES. Registra cuanto y a como esta, y yo lo convierto a tu moneda cuando haga falta.',
  },
} as const satisfies Record<string, LumenGuideMessage>;

export type GuideMessageKey = keyof typeof GUIDE_MESSAGES;
