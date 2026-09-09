'use server';

import { getSupabaseServerClient } from '@/infrastructure/supabase/server';
import type { MemberRole, SpaceMemberSummary } from '@/domain/types/dashboard';

interface SpaceMemberRow {
  user_id: string;
  role: MemberRole;
  joined_at: string;
  profile: { email: string; full_name: string | null } | null;
}

/**
 * Miembros del espacio con su nombre/correo. Requiere la policy
 * profiles_select_shared_space (0004): solo se ven perfiles de gente con la
 * que ya se comparte al menos un espacio, nunca perfiles arbitrarios.
 */
export async function getSpaceMembers(spaceId: string): Promise<SpaceMemberSummary[]> {
  const supabase = await getSupabaseServerClient();

  const { data, error } = await supabase
    .from('space_members')
    .select('user_id, role, joined_at, profile:profiles!space_members_user_id_fkey(email, full_name)')
    .eq('space_id', spaceId)
    .order('joined_at', { ascending: true })
    .returns<SpaceMemberRow[]>();

  if (error || !data) {
    console.error('Error al leer miembros del espacio:', error);
    return [];
  }

  return data.map((row) => ({
    userId: row.user_id,
    email: row.profile?.email ?? '(correo no disponible)',
    fullName: row.profile?.full_name ?? null,
    role: row.role,
    joinedAt: row.joined_at,
  }));
}

/** Renombra el espacio activo. Solo owner/admin (RLS: spaces_update_admin). */
export async function renameSpace(
  spaceId: string,
  name: string,
): Promise<{ success: true } | { success: false; error: string }> {
  const supabase = await getSupabaseServerClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();
  if (authError || !user) {
    return { success: false, error: 'No autorizado' };
  }

  const trimmed = name.trim();
  if (!trimmed) {
    return { success: false, error: 'El nombre no puede estar vacio.' };
  }

  const { error } = await supabase.from('spaces').update({ name: trimmed }).eq('id', spaceId);

  if (error) {
    console.error('Error al renombrar el espacio:', error);
    return { success: false, error: 'No se pudo renombrar el espacio. Verifica que tengas permisos de owner o admin.' };
  }

  return { success: true };
}
