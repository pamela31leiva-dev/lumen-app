import type { SpaceType } from '@/domain/types/dashboard';

/**
 * Modulo Fiscal (Bloque P5, Colombia). Lumen nunca calcula impuesto ni
 * decide una interpretacion tributaria -- estos tipos solo describen la
 * clasificacion que LA PERSONA ya conoce y declara; toda suma se hace en
 * Postgres sobre esos valores ya puestos (ver get_fiscal_summary, 0030).
 */

/** 'gravado'/'exento'/'no_gravado' aplican a categorias de ingreso; 'deducible'/'no_deducible' a categorias de gasto. */
export type TaxTreatment = 'gravado' | 'exento' | 'no_gravado' | 'deducible' | 'no_deducible';

export const TAX_TREATMENT_LABEL: Record<TaxTreatment, string> = {
  gravado: 'Gravado',
  exento: 'Exento',
  no_gravado: 'No gravado',
  deducible: 'Deducible',
  no_deducible: 'No deducible',
};

/**
 * Explicacion en lenguaje humano (Bloque P8) -- para alguien sin formacion
 * contable, "gravado" o "deducible" no dicen nada por si solos. Texto corto
 * a proposito: esto va debajo de un select, no reemplaza a un contador.
 */
export const TAX_TREATMENT_DESCRIPTION: Record<TaxTreatment, string> = {
  gravado: 'Le aplica impuesto de renta -- la mayoria de tus ingresos (salario, honorarios, ventas) caen aqui.',
  exento: 'La ley lo libera de impuesto de renta bajo ciertas condiciones (ej. cesantias, algunas indemnizaciones).',
  no_gravado: 'No hace parte de tu renta liquida (ej. un reembolso o algo que te devolvieron).',
  deducible: 'Se resta de tu ingreso antes de calcular el impuesto -- gasto necesario para producir ese ingreso (ej. gastos de tu negocio).',
  no_deducible: 'No se resta de nada -- es gasto personal o de consumo (ej. mercado, entretenimiento, ropa).',
};

/** Opciones validas para una categoria de ingreso. */
export const INCOME_TAX_TREATMENTS: TaxTreatment[] = ['gravado', 'exento', 'no_gravado'];
/** Opciones validas para una categoria de gasto. */
export const EXPENSE_TAX_TREATMENTS: TaxTreatment[] = ['deducible', 'no_deducible'];

/**
 * Sugerencia por defecto (Bloque P8): nunca se aplica sola, la persona
 * siempre confirma (via "Aplicar sugerencias estandar" o eligiendola a
 * mano). El criterio es deliberadamente simple y conservador:
 *   - Ingreso: 'gravado' siempre -- es la regla general en Colombia; si la
 *     persona sabe que el suyo es exento/no gravado (cesantias, reembolsos),
 *     lo corrige ella misma.
 *   - Gasto: en un espacio de Negocio, la mayoria de gastos son operativos
 *     -> 'deducible'; en Personal/Familiar/Proyecto son consumo propio ->
 *     'no_deducible'. Ninguna de las dos es universalmente cierta, pero es
 *     el default correcto con mas frecuencia que su opuesto.
 */
export function suggestTaxTreatment(categoryKind: 'income' | 'expense', spaceType: SpaceType): TaxTreatment {
  if (categoryKind === 'income') return 'gravado';
  return spaceType === 'business' ? 'deducible' : 'no_deducible';
}

export interface FiscalMonthSummary {
  month: number; // 1-12
  incomeGravado: number;
  incomeExento: number;
  incomeNoGravado: number;
  expenseDeducible: number;
  expenseNoDeducible: number;
  withholdingTaxTotal: number;
}

export interface FiscalSummary {
  year: number;
  incomeGravado: number;
  incomeExento: number;
  incomeNoGravado: number;
  /** Ingresos de este año sin ninguna categoria fiscal asignada todavia -- una señal de "falta clasificar", no un tratamiento en si. */
  incomeUnclassified: number;
  expenseDeducible: number;
  expenseNoDeducible: number;
  /** Gastos de este año sin ninguna categoria fiscal asignada todavia. */
  expenseUnclassified: number;
  withholdingTaxTotal: number;
  monthly: FiscalMonthSummary[];
}
