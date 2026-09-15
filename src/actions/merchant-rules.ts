'use server';

import { getSupabaseServerClient } from '@/infrastructure/supabase/server';
import type { Folder } from '@/domain/folders';

export interface MerchantRuleSummary {
  id: string;
  pattern: string;
  categoryId: string | null;
  categoryName: string | null;
  accountId: string | null;
  accountName: string | null;
  tags: string[];
  folder: Folder | null;
  isActive: boolean;
  createdAt: string;
}

export interface MerchantRuleInput {
  pattern: string;
  categoryId: string | null;
  accountId: string | null;
  tags: string[];
  folder: Folder | null;
}

/** Todas las reglas del espacio (activas e inactivas), para la pantalla de gestion en Ajustes. */
export async function getMerchantRules(spaceId: string): Promise<MerchantRuleSummary[]> {
  const supabase = await getSupabaseServerClient();

  const { data, error } = await supabase
    .from('merchant_rules')
    .select('id, pattern, category_id, account_id, tags, folder, is_active, created_at, category:categories(name), account:accounts(name)')
    .eq('space_id', spaceId)
    .order('created_at', { ascending: false })
    .returns<
      {
        id: string;
        pattern: string;
        category_id: string | null;
        account_id: string | null;
        tags: string[];
        folder: Folder | null;
        is_active: boolean;
        created_at: string;
        category: { name: string } | null;
        account: { name: string } | null;
      }[]
    >();

  if (error) {
    console.error('Error al leer las reglas de comercio:', error);
    return [];
  }

  return (data ?? []).map((row) => ({
    id: row.id,
    pattern: row.pattern,
    categoryId: row.category_id,
    categoryName: row.category?.name ?? null,
    accountId: row.account_id,
    accountName: row.account?.name ?? null,
    tags: row.tags ?? [],
    folder: row.folder,
    isActive: row.is_active,
    createdAt: row.created_at,
  }));
}

function validateRuleInput(input: MerchantRuleInput): string | null {
  if (!input.pattern.trim()) return 'Escribe un texto que identifique al comercio (ej. "NETFLIX", "EPM").';
  return null;
}

/** Crea una regla: la proxima captura cuya descripcion contenga "pattern" pre-llenara categoria/cuenta/etiquetas/carpeta automaticamente. */
export async function createMerchantRule(spaceId: string, input: MerchantRuleInput): Promise<{ success: true } | { success: false; error: string }> {
  const supabase = await getSupabaseServerClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();
  if (authError || !user) return { success: false, error: 'No autorizado' };

  const validationError = validateRuleInput(input);
  if (validationError) return { success: false, error: validationError };

  const { error } = await supabase.from('merchant_rules').insert({
    space_id: spaceId,
    pattern: input.pattern.trim(),
    category_id: input.categoryId,
    account_id: input.accountId,
    tags: input.tags,
    folder: input.folder,
    created_by: user.id,
  });

  if (error) {
    console.error('Error al crear la regla de comercio:', error);
    return { success: false, error: 'No se pudo crear la regla.' };
  }

  return { success: true };
}

/** Edita una regla existente (incluye activar/desactivar). RLS exige editor+. */
export async function updateMerchantRule(
  spaceId: string,
  ruleId: string,
  input: MerchantRuleInput & { isActive: boolean },
): Promise<{ success: true } | { success: false; error: string }> {
  const supabase = await getSupabaseServerClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();
  if (authError || !user) return { success: false, error: 'No autorizado' };

  const validationError = validateRuleInput(input);
  if (validationError) return { success: false, error: validationError };

  const { error, count } = await supabase
    .from('merchant_rules')
    .update(
      {
        pattern: input.pattern.trim(),
        category_id: input.categoryId,
        account_id: input.accountId,
        tags: input.tags,
        folder: input.folder,
        is_active: input.isActive,
      },
      { count: 'exact' },
    )
    .eq('id', ruleId)
    .eq('space_id', spaceId);

  if (error) {
    console.error('Error al editar la regla de comercio:', error);
    return { success: false, error: 'No se pudo editar la regla.' };
  }
  if (!count) return { success: false, error: 'No se encontro la regla, o no tienes permiso para editarla.' };

  return { success: true };
}

/** Elimina una regla. RLS exige owner/admin. */
export async function deleteMerchantRule(spaceId: string, ruleId: string): Promise<{ success: true } | { success: false; error: string }> {
  const supabase = await getSupabaseServerClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();
  if (authError || !user) return { success: false, error: 'No autorizado' };

  const { error, count } = await supabase.from('merchant_rules').delete({ count: 'exact' }).eq('id', ruleId).eq('space_id', spaceId);

  if (error) {
    console.error('Error al eliminar la regla de comercio:', error);
    return { success: false, error: 'No se pudo eliminar la regla.' };
  }
  if (!count) return { success: false, error: 'No tienes permiso para eliminar esta regla (requiere rol Owner o Admin).' };

  return { success: true };
}
