import type { getSupabaseServerClient } from '@/infrastructure/supabase/server';
import type { Folder } from '@/domain/folders';
import type { MerchantRule } from '@/domain/rules/merchant-rules';

/** El cliente de sesion y el de service_role comparten el mismo tipo generico (ninguno usa `Database`), asi que ambos calzan aqui. */
export type AnySupabaseClient = Awaited<ReturnType<typeof getSupabaseServerClient>>;

/**
 * Trae las reglas de comercio ACTIVAS de un espacio, ya traducidas al tipo de
 * dominio. Vive fuera de actions/merchant-rules.ts (que es 'use server') para
 * poder recibir un cliente Supabase ya creado -- tanto el de sesion (captura
 * en vivo, importacion CSV) como el de service_role (webhook de la Bandeja
 * Automatica, sin sesion de usuario) sirven aqui igual.
 */
export async function fetchActiveMerchantRules(supabase: AnySupabaseClient, spaceId: string): Promise<MerchantRule[]> {
  const { data, error } = await supabase
    .from('merchant_rules')
    .select('id, pattern, category_id, account_id, tags, folder')
    .eq('space_id', spaceId)
    .eq('is_active', true);

  if (error) {
    console.error('Error al leer las reglas de comercio:', error);
    return [];
  }

  return (data ?? []).map((row) => ({
    id: row.id,
    pattern: row.pattern,
    categoryId: row.category_id,
    accountId: row.account_id,
    tags: Array.isArray(row.tags) ? row.tags : [],
    folder: row.folder as Folder | null,
  }));
}
