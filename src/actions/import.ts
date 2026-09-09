'use server';

import { getSupabaseServerClient } from '@/infrastructure/supabase/server';
import { buildImportPreview } from '@/domain/import/parse-row';
import type { BulkImportResult, ColumnMapping, RawImportRow } from '@/domain/types/import';

const INSERT_CHUNK_SIZE = 250;

/**
 * Procesa en lote las filas crudas de un CSV/Excel. El backend vuelve a
 * interpretar cada fila con `buildImportPreview` (nunca confia en el preview
 * ya calculado por el cliente) e inserta unicamente las filas validas, todas
 * en estado `pending_confirmation`. "Cero alucinaciones en los saldos
 * finales" se cumple estructuralmente: `account_balances` solo suma
 * transacciones `confirmed`, asi que un lote importado no puede alterar
 * ningun saldo hasta que una persona confirme cada fila una por una (o desde
 * la bandeja "Por confirmar"). El trigger trg_transactions_audit (0001) deja
 * una traza de auditoria individual por cada fila insertada.
 */
export async function processBulkImport(
  spaceId: string,
  rows: RawImportRow[],
  mapping: ColumnMapping,
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

  const rowsToInsert = preview.validRows.map((row) => ({
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
  }));

  let importedCount = 0;
  for (let i = 0; i < rowsToInsert.length; i += INSERT_CHUNK_SIZE) {
    const chunk = rowsToInsert.slice(i, i + INSERT_CHUNK_SIZE);
    const { data, error } = await supabase.from('transactions').insert(chunk).select('id');

    if (error) {
      console.error('Error al importar lote de transacciones:', error);
      return {
        success: false,
        error: `Se importaron ${importedCount} de ${rowsToInsert.length} filas antes de un error. Intenta de nuevo con las restantes.`,
      };
    }

    importedCount += data?.length ?? 0;
  }

  return { success: true, importedCount, skippedCount: preview.invalidRows.length };
}
