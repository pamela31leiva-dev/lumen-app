import type { Transition, Variants } from 'framer-motion';

/**
 * Calibracion unica de "fisica" para toda la app -- un solo lugar para
 * ajustar como se siente el movimiento en vez de constantes repetidas y
 * potencialmente inconsistentes en cada componente. Dos perfiles nada mas
 * a proposito (no una docena de variantes por micro-caso):
 *
 * - SPRING_SNAPPY: paneles flotantes y modales -- deben sentirse
 *   INMEDIATOS (algo con lo que se interactua todo el tiempo, ej. abrir un
 *   select), rigidez alta y poco rebote.
 * - SPRING_SOFT: tarjetas y contenido que aparece en el flujo normal de la
 *   pagina (ej. un tip de Lumen Guide, un resultado que llega) -- un poco
 *   mas de peso/rebote, se siente "organico" sin sentirse lento.
 */
export const SPRING_SNAPPY: Transition = { type: 'spring', stiffness: 480, damping: 36, mass: 0.8 };
export const SPRING_SOFT: Transition = { type: 'spring', stiffness: 260, damping: 26, mass: 1 };

/** Fondo/velo de un modal o panel a pantalla completa. */
export const OVERLAY_VARIANTS: Variants = {
  hidden: { opacity: 0 },
  visible: { opacity: 1, transition: { duration: 0.15, ease: 'easeOut' } },
  exit: { opacity: 0, transition: { duration: 0.12, ease: 'easeIn' } },
};

/** Panel de un modal centrado -- entra con resorte, sale rapido y sutil. */
export const MODAL_PANEL_VARIANTS: Variants = {
  hidden: { opacity: 0, scale: 0.94, y: 12 },
  visible: { opacity: 1, scale: 1, y: 0, transition: SPRING_SNAPPY },
  exit: { opacity: 0, scale: 0.96, y: 8, transition: { duration: 0.12, ease: 'easeIn' } },
};

/** Panel flotante anclado a un trigger (CustomSelect, SpaceSwitcher). */
export const FLOATING_PANEL_VARIANTS: Variants = {
  hidden: { opacity: 0, scale: 0.97, y: -4 },
  visible: { opacity: 1, scale: 1, y: 0, transition: SPRING_SNAPPY },
  exit: { opacity: 0, scale: 0.98, y: -2, transition: { duration: 0.1, ease: 'easeIn' } },
};

/** Contenido que aparece/desaparece dentro del flujo normal (alturas variables). */
export const COLLAPSE_VARIANTS: Variants = {
  hidden: { opacity: 0, height: 0 },
  visible: { opacity: 1, height: 'auto', transition: SPRING_SOFT },
  exit: { opacity: 0, height: 0, transition: { duration: 0.15, ease: 'easeIn' } },
};
