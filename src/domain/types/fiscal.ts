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

/** Opciones validas para una categoria de ingreso. */
export const INCOME_TAX_TREATMENTS: TaxTreatment[] = ['gravado', 'exento', 'no_gravado'];
/** Opciones validas para una categoria de gasto. */
export const EXPENSE_TAX_TREATMENTS: TaxTreatment[] = ['deducible', 'no_deducible'];

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
