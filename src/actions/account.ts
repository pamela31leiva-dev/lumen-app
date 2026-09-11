'use server';

import { getSupabaseServerClient } from '@/infrastructure/supabase/server';
import { getSupabaseServiceRoleClient } from '@/infrastructure/supabase/service-role-client';

export interface AccountDeletionBlocker {
  spaceId: string;
  spaceName: string;
  memberCount: number;
}

export interface AccountDeletionPreview {
  /** Espacios compartidos donde la persona es dueña y hay otros miembros -- deben resolverse antes de poder eliminar la cuenta. */
  blockers: AccountDeletionBlocker[];
  /** Espacios donde la persona es la unica integrante -- se borran junto con la cuenta, sin afectar a nadie mas. */
  soloOwnedSpaceCount: number;
}

interface MembershipRow {
  role: 'owner' | 'admin' | 'editor' | 'viewer';
  space_id: string;
  space: { id: string; name: string } | null;
}

/**
 * Antes de mostrar el modal de eliminacion: ¿la persona sigue siendo dueña
 * de algun espacio COMPARTIDO? Si es asi, eliminar la cuenta se bloquea --
 * nunca se borra en silencio un espacio con datos de otras personas, ni
 * queda un espacio con un dueño fantasma.
 */
export async function getAccountDeletionPreview(): Promise<AccountDeletionPreview | { error: string }> {
  const supabase = await getSupabaseServerClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();
  if (authError || !user) return { error: 'No autorizado' };

  const { data: memberships, error } = await supabase
    .from('space_members')
    .select('role, space_id, space:spaces(id, name)')
    .eq('user_id', user.id)
    .returns<MembershipRow[]>();
  if (error) {
    console.error('Error al verificar espacios antes de eliminar la cuenta:', error);
    return { error: 'No se pudo verificar tus espacios. Intenta de nuevo.' };
  }

  const blockers: AccountDeletionBlocker[] = [];
  let soloOwnedSpaceCount = 0;

  for (const membership of memberships ?? []) {
    if (membership.role !== 'owner' || !membership.space) continue;

    const { count } = await supabase
      .from('space_members')
      .select('*', { count: 'exact', head: true })
      .eq('space_id', membership.space_id);

    if ((count ?? 0) > 1) {
      blockers.push({ spaceId: membership.space.id, spaceName: membership.space.name, memberCount: count ?? 0 });
    } else {
      soloOwnedSpaceCount += 1;
    }
  }

  return { blockers, soloOwnedSpaceCount };
}

/**
 * Eliminacion definitiva de la cuenta: borra los espacios de los que la
 * persona es unica integrante (cascada limpia -- cuentas, movimientos,
 * facturas, ingresos fijos, auditoria, todo vive exclusivamente ahi) y
 * despues elimina el usuario de auth (cascada a profiles, 0001). Los
 * espacios compartidos donde participaba SIN ser dueña no se tocan: su
 * aporte historico se conserva con la atribucion en null (ver 0020,
 * ON DELETE SET NULL) para no romper la integridad de datos de quienes
 * siguen ahi. Requiere escribir "ELIMINAR" -- la primera de las dos
 * confirmaciones del flujo (la segunda es el boton final en la interfaz).
 */
export async function deleteMyAccount(confirmationText: string): Promise<{ success: true } | { success: false; error: string }> {
  if (confirmationText.trim().toUpperCase() !== 'ELIMINAR') {
    return { success: false, error: 'Escribe ELIMINAR para confirmar.' };
  }

  const supabase = await getSupabaseServerClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();
  if (authError || !user) {
    return { success: false, error: 'No autorizado' };
  }

  const preview = await getAccountDeletionPreview();
  if ('error' in preview) return { success: false, error: preview.error };
  if (preview.blockers.length > 0) {
    return {
      success: false,
      error: `Sigues siendo dueña/o de ${preview.blockers.length === 1 ? 'un espacio compartido' : 'espacios compartidos'} (${preview.blockers
        .map((b) => b.spaceName)
        .join(', ')}). Transfiere la propiedad a otro miembro o elimina a los demas integrantes antes de eliminar tu cuenta.`,
    };
  }

  const { data: memberships, error: membershipsError } = await supabase
    .from('space_members')
    .select('role, space_id')
    .eq('user_id', user.id)
    .eq('role', 'owner');
  if (membershipsError) {
    console.error('Error al listar espacios propios antes de eliminar la cuenta:', membershipsError);
    return { success: false, error: 'No se pudo completar la eliminacion. Intenta de nuevo.' };
  }

  for (const membership of memberships ?? []) {
    // Re-verifica justo antes de borrar (nadie se unio en el intervalo entre
    // el preview y este momento) -- ventana corta, pero mejor cerrarla.
    const { count } = await supabase
      .from('space_members')
      .select('*', { count: 'exact', head: true })
      .eq('space_id', membership.space_id);
    if ((count ?? 0) > 1) {
      return {
        success: false,
        error: 'Alguien se unio a uno de tus espacios justo ahora. Vuelve a intentarlo.',
      };
    }

    const { error: deleteSpaceError } = await supabase.from('spaces').delete().eq('id', membership.space_id);
    if (deleteSpaceError) {
      console.error('Error al eliminar un espacio propio antes de borrar la cuenta:', deleteSpaceError);
      return { success: false, error: 'No se pudo eliminar uno de tus espacios. Intenta de nuevo.' };
    }
  }

  const serviceRoleClient = getSupabaseServiceRoleClient();
  if (!serviceRoleClient) {
    console.error('SUPABASE_SERVICE_ROLE_KEY no configurada: no se puede completar la eliminacion de cuenta.');
    return { success: false, error: 'No se pudo completar la eliminacion. Contacta a soporte.' };
  }

  const { error: deleteUserError } = await serviceRoleClient.auth.admin.deleteUser(user.id);
  if (deleteUserError) {
    console.error('Error al eliminar el usuario de autenticacion:', deleteUserError);
    return { success: false, error: 'No se pudo completar la eliminacion. Contacta a soporte.' };
  }

  return { success: true };
}
