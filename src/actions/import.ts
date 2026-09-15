'use server';

import { getSupabaseServerClient } from '@/infrastructure/supabase/server';
import { buildImportPreview } from '@/domain/import/parse-row';
import { computeRowHash } from '@/domain/import/hash';
import type { BulkImportResult, ColumnMapping, ImportDuplicateCheck, RawImportRow } from '@/domain/types/import';

const INSERT_CHUNK_SIZE = 250;
const HASH_LOOKUP_CHUNK_SIZE = 250;

/**
 * Comprueba, ANTES de insertar nada, si (a) este archivo (por contenido,
 * via SHA-256 calculado en el navegador) ya se importo antes en este
 * espacio, y (b) cuales de las filas validas ya existen como transaccion
 * (huella determinista, ver domain/import/hash.ts). BulkImportModal usa
 * esto para mostrar una advertencia clara antes de que el usuario confirme
 * la importacion -- nunca se bloquea, solo se informa.
 */
export async function checkImportDuplicates(
  spaceId: string,
  fileHash: string,
  rows: RawImportRow[],
  mapping: ColumnMapping,
): Promise<ImportDuplicateCheck | { error: string }> {
  const supabase = await getSupabaseServerClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();
  if (authError || !user) return { error: 'No autorizado' };

  const { data: existingBatch, error: batchError } = await supabase
    .from('import_batches')
    .select('created_at, row_count, imported_count')
    .eq('space_id', spaceId)
    .eq('file_hash', fileHash)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (batchError) console.error('Error al comprobar si el archivo ya se importo:', batchError);

  const preview = buildImportPreview(rows, mapping);
  const rowHashes = preview.validRows.map((row) => computeRowHash(spaceId, row));

  const existingHashSet = new Set<string>();
  for (let i = 0; i < rowHashes.length; i += HASH_LOOKUP_CHUNK_SIZE) {
    const chunk = rowHashes.slice(i, i + HASH_LOOKUP_CHUNK_SIZE);
    if (chunk.length === 0) continue;
    const { data: matches, error: matchError } = await supabase
      .from('transactions')
      .select('import_row_hash')
      .eq('space_id', spaceId)
      .in('import_row_hash', chunk);
    if (matchError) {
      console.error('Error al comprobar duplicados de fila:', matchError);
      continue;
    }
    for (const row of matches ?? []) {
      if (row.import_row_hash) existingHashSet.add(row.import_row_hash);
    }
  }

  const duplicateRowIndexes = preview.validRows
    .filter((row, i) => existingHashSet.has(rowHashes[i]))
    .map((row) => row.rowIndex);

  return {
    fileAlreadyImported: existingBatch
      ? { importedAt: existingBatch.created_at, rowCount: existingBatch.row_count, importedCount: existingBatch.imported_count }
      : null,
    duplicateRowIndexes,
  };
}

/**
 * Procesa en lote las filas crudas de un CSV/Excel. El backend vuelve a
 * interpretar cada fila con `buildImportPreview` (nunca confia en el preview
 * ya calculado por el cliente) e inserta unicamente las filas validas y no
 * omitidas, todas en estado `pending_confirmation`. "Cero alucinaciones en
 * los saldos finales" se cumple estructuralmente: `account_balances` solo
 * suma transacciones `confirmed`, asi que un lote importado no puede alterar
 * ningun saldo hasta que una persona confirme cada fila una por una.
 *
 * Idempotencia (0025): cada fila insertada guarda su huella
 * (`import_row_hash`) y el lote al que pertenece (`import_batch_id`), y el
 * lote mismo queda registrado con la huella SHA-256 del archivo completo --
 * asi, una reimportacion accidental del mismo archivo se reconoce de
 * inmediato (ver checkImportDuplicates) en vez de duplicar todo en silencio.
 */
export async function processBulkImport(
  spaceId: string,
  rows: RawImportRow[],
  mapping: ColumnMapping,
  fileMeta: { name: string; hash: string; sizeBytes: number },
  skipRowIndexes: number[] = [],
): Promise<BulkImportResult> {
  const supabase = await getSupabaseServerClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();
  if (authError || !user) {
    return { success: false, error: 'No autorizado' };
  }

  if (rows.length === 0) {
    return { success: false, error: 'El archivo no tiene filas para importar.' };
  }

  const { data: space, error: spaceError } = await supabase
    .from('spaces')
    .select('base_currency')
    .eq('id', spaceId)
    .single();
  if (spaceError || !space) {
    return { success: false, error: 'No tienes acceso a este espacio.' };
  }

  const preview = buildImportPreview(rows, mapping);
  if (preview.validRows.length === 0) {
    return { success: false, error: 'Ninguna fila pudo interpretarse con el mapeo de columnas indicado.' };
  }

  const skipSet = new Set(skipRowIndexes);
  const rowsToImport = preview.validRows.filter((row) => !skipSet.has(row.rowIndex));
  const duplicateCount = preview.validRows.length - rowsToImport.length;

  const { data: batch, error: batchInsertError } = await supabase
    .from('import_batches')
    .insert({
      space_id: spaceId,
      uploaded_by: user.id,
      file_name: fileMeta.name,
      file_hash: fileMeta.hash,
      file_size_bytes: fileMeta.sizeBytes,
      row_count: rows.length,
      skipped_count: preview.invalidRows.length,
      duplicate_count: duplicateCount,
    })
    .select('id')
    .single();
  if (batchInsertError || !batch) {
    console.error('Error al registrar el lote de importacion:', batchInsertError);
    return { success: false, error: 'No se pudo registrar la importacion. Intenta de nuevo.' };
  }

  const rowsToInsert = rowsToImport.map((row) => ({
    space_id: spaceId,
    type: row.type,
    amount_original: row.amountOriginal as number,
    currency_original: space.base_currency,
    exchange_rate: 1,
    source: 'import' as const,
    status: 'pending_confirmation' as const,
    description: row.description,
    transaction_date: row.transactionDate as string,
    ai_raw_interpretation: { raw: row.raw, mapping },
    created_by: user.id,
    import_batch_id: batch.id,
    import_row_hash: computeRowHash(spaceId, row),
  }));

  let importedCount = 0;
  for (let i = 0; i < rowsToInsert.length; i += INSERT_CHUNK_SIZE) {
    const chunk = rowsToInsert.slice(i, i + INSERT_CHUNK_SIZE);
    const { data, error } = await supabase.from('transactions').insert(chunk).select('id');

    if (error) {
      console.error('Error al importar lote de transacciones:', error);
      await supabase.from('import_batches').update({ imported_count: importedCount }).eq('id', batch.id);
      return {
        success: false,
        error: `Se importaron ${importedCount} de ${rowsToInsert.length} filas antes de un error. Intenta de nuevo con las restantes.`,
      };
    }

    importedCount += data?.length ?? 0;
  }

  await supabase.from('import_batches').update({ imported_count: importedCount }).eq('id', batch.id);

  return { success: true, importedCount, skippedCount: preview.invalidRows.length, duplicateCount };
}
