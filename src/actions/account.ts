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

  const ownedMemberships = (memberships ?? []).filter(
    (m): m is MembershipRow & { space: { id: string; name: string } } => m.role === 'owner' && m.space !== null,
  );

  const blockers: AccountDeletionBlocker[] = [];
  let soloOwnedSpaceCount = 0;

  // Un solo round-trip para contar miembros de TODOS los espacios propios a
  // la vez (antes: una consulta por espacio, dentro de un for) -- para
  // alguien dueño de N espacios esto era N round-trips secuenciales.
  if (ownedMemberships.length > 0) {
    const { data: memberRows } = await supabase
      .from('space_members')
      .select('space_id')
      .in(
        'space_id',
        ownedMemberships.map((m) => m.space_id),
      );

    const countBySpaceId = new Map<string, number>();
    for (const row of memberRows ?? []) {
      countBySpaceId.set(row.space_id, (countBySpaceId.get(row.space_id) ?? 0) + 1);
    }

    for (const membership of ownedMemberships) {
      const count = countBySpaceId.get(membership.space_id) ?? 0;
      if (count > 1) {
        blockers.push({ spaceId: membership.space.id, spaceName: membership.space.name, memberCount: count });
      } else {
        soloOwnedSpaceCount += 1;
      }
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

  const ownedSpaceIds = (memberships ?? []).map((m) => m.space_id);

  if (ownedSpaceIds.length > 0) {
    // Re-verifica justo antes de borrar (nadie se unio en el intervalo entre
    // el preview y este momento) -- un solo round-trip para TODOS los
    // espacios propios en vez de uno por espacio dentro de un for.
    const { data: memberRows } = await supabase.from('space_members').select('space_id').in('space_id', ownedSpaceIds);
    const countBySpaceId = new Map<string, number>();
    for (const row of memberRows ?? []) {
      countBySpaceId.set(row.space_id, (countBySpaceId.get(row.space_id) ?? 0) + 1);
    }
    if (ownedSpaceIds.some((id) => (countBySpaceId.get(id) ?? 0) > 1)) {
      return {
        success: false,
        error: 'Alguien se unio a uno de tus espacios justo ahora. Vuelve a intentarlo.',
      };
    }

    const { error: deleteSpacesError } = await supabase.from('spaces').delete().in('id', ownedSpaceIds);
    if (deleteSpacesError) {
      console.error('Error al eliminar tus espacios propios antes de borrar la cuenta:', deleteSpacesError);
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
