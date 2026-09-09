import type { TransactionType } from '@/domain/types/capture';

/**
 * Fila cruda tal como la entrega el parser de CSV/Excel en el navegador:
 * claves = encabezados originales del archivo, valores = texto de la celda.
 * Nunca contiene un monto o fecha ya interpretados — esa interpretacion
 * ocurre en `domain/import/parse-row.ts`, ejecutada tanto en el cliente
 * (preview) como de nuevo en el servidor (fuente de verdad).
 */
export type RawImportRow = Record<string, string>;

/** Asigna los encabezados reales del archivo subido a los campos que el sistema necesita interpretar. */
export interface ColumnMapping {
  dateColumn: string;
  amountColumn: string;
  descriptionColumn: string | null;
  /** Si es null, el tipo se asume 'expense' para todas las filas; el usuario lo corrige fila por fila al confirmar. */
  typeColumn: string | null;
}

/** Resultado de interpretar una fila cruda segun el mapeo de columnas. */
export interface ParsedImportRow {
  rowIndex: number;
  raw: RawImportRow;
  transactionDate: string | null;
  amountOriginal: number | null;
  description: string | null;
  type: TransactionType;
  /** Nombres de campo con error ('fecha', 'monto'). Vacio = fila valida para importar. */
  errors: string[];
}

export interface ImportPreviewResult {
  totalRows: number;
  validRows: ParsedImportRow[];
  invalidRows: ParsedImportRow[];
}

export type BulkImportResult =
  | { success: true; importedCount: number; skippedCount: number }
  | { success: false; error: string };
