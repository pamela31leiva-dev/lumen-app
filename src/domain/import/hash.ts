import { createHash } from 'node:crypto';
import type { ParsedImportRow } from '@/domain/types/import';

/**
 * Huella determinista de una fila YA interpretada (fecha/monto/tipo/
 * descripcion), no del texto crudo de la celda -- asi, la misma transaccion
 * descrita en dos formatos de fecha distintos ("01/03/2026" vs "2026-03-01")
 * sigue produciendo el mismo hash. Solo se usa server-side (Node `crypto`);
 * nunca se importa desde un componente de cliente.
 */
function normalizeDescriptionForHash(text: string): string {
  return text.trim().toLowerCase().replace(/\s+/g, ' ');
}

export function computeRowHash(
  spaceId: string,
  row: Pick<ParsedImportRow, 'transactionDate' | 'amountOriginal' | 'type' | 'description'>,
): string {
  const datePart = row.transactionDate ? row.transactionDate.slice(0, 10) : '';
  const amountPart = row.amountOriginal !== null ? row.amountOriginal.toFixed(2) : '';
  const descriptionPart = normalizeDescriptionForHash(row.description ?? '');
  const canonical = `${spaceId}|${datePart}|${row.type}|${amountPart}|${descriptionPart}`;
  return createHash('sha256').update(canonical).digest('hex');
}
