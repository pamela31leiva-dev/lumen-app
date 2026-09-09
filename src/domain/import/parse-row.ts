import type { TransactionType } from '@/domain/types/capture';
import type { ColumnMapping, ImportPreviewResult, ParsedImportRow, RawImportRow } from '@/domain/types/import';

/**
 * Interpreta un monto de extracto bancario tolerando formato colombiano
 * (1.234.567,89) y anglosajon (1,234,567.89), simbolos de moneda, espacios
 * y parentesis/signo negativo para valores en contra. Devuelve el valor con
 * signo (negativo = salida de dinero); quien llama decide si usa el signo
 * para inferir el tipo y luego se queda solo con la magnitud absoluta,
 * porque `transactions.amount_original` siempre se guarda positivo
 * (el signo real vive en la columna `type`).
 */
export function parseAmount(rawValue: string | undefined): number | null {
  if (!rawValue) return null;
  const trimmed = rawValue.trim();
  if (!trimmed) return null;

  const isNegative = /^\(.*\)$/.test(trimmed) || trimmed.includes('-');
  let cleaned = trimmed.replace(/[^0-9.,]/g, '');
  if (!cleaned) return null;

  const lastComma = cleaned.lastIndexOf(',');
  const lastDot = cleaned.lastIndexOf('.');

  if (lastComma > -1 && lastDot > -1) {
    // El separador decimal es el que aparece mas a la derecha; el otro es de miles.
    cleaned = lastComma > lastDot ? cleaned.replace(/\./g, '').replace(',', '.') : cleaned.replace(/,/g, '');
  } else if (lastComma > -1) {
    const decimals = cleaned.length - lastComma - 1;
    cleaned = decimals === 2 ? cleaned.replace(',', '.') : cleaned.replace(/,/g, '');
  } else if (lastDot > -1) {
    const decimals = cleaned.length - lastDot - 1;
    if (decimals !== 2) cleaned = cleaned.replace(/\./g, '');
  }

  const value = Number(cleaned);
  if (!Number.isFinite(value) || value === 0) return null;
  return isNegative ? -Math.abs(value) : Math.abs(value);
}

/** Interpreta una fecha de extracto tolerando dd/mm/aaaa, dd-mm-aaaa, y formatos ISO/legibles por Date. */
export function parseImportDate(rawValue: string | undefined): string | null {
  if (!rawValue) return null;
  const trimmed = rawValue.trim();
  if (!trimmed) return null;

  const dmy = trimmed.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{2,4})$/);
  if (dmy) {
    const [, day, month, yearRaw] = dmy;
    const year = yearRaw.length === 2 ? 2000 + Number(yearRaw) : Number(yearRaw);
    const date = new Date(Date.UTC(year, Number(month) - 1, Number(day)));
    if (!Number.isNaN(date.getTime())) return date.toISOString();
  }

  const parsed = new Date(trimmed);
  if (!Number.isNaN(parsed.getTime())) return parsed.toISOString();

  return null;
}

/** Reconoce palabras comunes de extractos colombianos; si no reconoce nada, devuelve null (el llamador decide el default). */
export function normalizeImportType(rawValue: string | undefined): TransactionType | null {
  const normalized = rawValue?.trim().toLowerCase();
  if (!normalized) return null;
  if (/(ingreso|income|abono|consignacion|deposito)/.test(normalized)) return 'income';
  if (/(transferencia|transfer)/.test(normalized)) return 'transfer';
  if (/(gasto|expense|debito|retiro|compra|pago)/.test(normalized)) return 'expense';
  return null;
}

/**
 * Interpreta una fila cruda segun el mapeo de columnas. Pura y sin
 * dependencias de framework: se ejecuta tanto en el navegador (preview
 * instantaneo en BulkImportModal) como en el servidor (processBulkImport
 * NUNCA confia en el preview del cliente y vuelve a llamar esta misma
 * funcion sobre las filas crudas).
 */
export function parseImportRow(row: RawImportRow, mapping: ColumnMapping, rowIndex: number): ParsedImportRow {
  const transactionDate = parseImportDate(row[mapping.dateColumn]);
  const signedAmount = parseAmount(row[mapping.amountColumn]);
  const amountOriginal = signedAmount !== null ? Math.round(Math.abs(signedAmount) * 100) / 100 : null;

  const rawType = mapping.typeColumn ? row[mapping.typeColumn] : undefined;
  const type = normalizeImportType(rawType) ?? 'expense';

  const rawDescription = mapping.descriptionColumn ? row[mapping.descriptionColumn]?.trim() : '';
  const description = rawDescription || null;

  const errors: string[] = [];
  if (!transactionDate) errors.push('fecha');
  if (amountOriginal === null) errors.push('monto');

  return { rowIndex, raw: row, transactionDate, amountOriginal, description, type, errors };
}

export function buildImportPreview(rows: RawImportRow[], mapping: ColumnMapping): ImportPreviewResult {
  const parsed = rows.map((row, index) => parseImportRow(row, mapping, index));
  return {
    totalRows: parsed.length,
    validRows: parsed.filter((row) => row.errors.length === 0),
    invalidRows: parsed.filter((row) => row.errors.length > 0),
  };
}
