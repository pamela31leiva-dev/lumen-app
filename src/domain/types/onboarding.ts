import type { SpaceType } from '@/domain/types/dashboard';

/**
 * Meta financiera elegida en el paso 3 del Wizard de Bienvenida. Se guarda
 * en profiles.primary_goal (0037) unicamente para personalizacion futura
 * (ej. que "Lumen Guide" la recuerde en otra pantalla) -- hoy no condiciona
 * ningun calculo ni bloquea nada si falta.
 */
export type OnboardingGoal = 'visibility' | 'savings' | 'tax_ready' | 'organize';

export const ONBOARDING_GOAL_OPTIONS: { value: OnboardingGoal; label: string }[] = [
  { value: 'visibility', label: 'Entender en que se me va el dinero' },
  { value: 'savings', label: 'Ahorrar de forma constante' },
  { value: 'tax_ready', label: 'Tener mis cuentas listas para declarar' },
  { value: 'organize', label: 'Simplemente llevar un registro ordenado' },
];

export const ONBOARDING_SPACE_TYPE_OPTIONS: { value: SpaceType; title: string; description: string }[] = [
  { value: 'personal', title: 'Mis finanzas personales', description: 'Gastos, ingresos y ahorro del dia a dia.' },
  {
    value: 'business',
    title: 'Mi negocio o actividad independiente',
    description: 'Ingresos, gastos deducibles y lo fiscal, separado de lo personal.',
  },
  { value: 'family', title: 'Gastos compartidos en familia', description: 'Un espacio que varias personas pueden ver y registrar.' },
  { value: 'project', title: 'Un proyecto o meta puntual', description: 'Algo con fecha de inicio y fin, aparte de tus finanzas de siempre.' },
];

/** Nombre por defecto del espacio segun el tipo elegido en el paso 2. */
export const ONBOARDING_DEFAULT_SPACE_NAME: Record<SpaceType, string> = {
  personal: 'Espacio Personal',
  business: 'Mi Negocio',
  family: 'Espacio Familiar',
  project: 'Mi Proyecto',
};
