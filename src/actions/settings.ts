'use server';

import { getSupabaseServerClient } from '@/infrastructure/supabase/server';
import { getSupabaseServiceRoleClient } from '@/infrastructure/supabase/service-role-client';
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

/**
 * Preferencias de Alertas: cuantos dias antes del vencimiento una factura se
 * marca "por vencer" (BillAlerts, ActionFeed) -- antes fijo en 3 dias para
 * todo el mundo. RLS (spaces_update_admin) exige owner/admin, igual que
 * renameSpace.
 */
export async function updateAlertPreferences(
  spaceId: string,
  billReminderDays: number,
): Promise<{ success: true } | { success: false; error: string }> {
  const supabase = await getSupabaseServerClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();
  if (authError || !user) {
    return { success: false, error: 'No autorizado' };
  }

  if (!Number.isInteger(billReminderDays) || billReminderDays < 1 || billReminderDays > 30) {
    return { success: false, error: 'El umbral debe ser un numero entero entre 1 y 30 dias.' };
  }

  const { error } = await supabase.from('spaces').update({ bill_reminder_days: billReminderDays }).eq('id', spaceId);

  if (error) {
    console.error('Error al actualizar preferencias de alertas:', error);
    return { success: false, error: 'No se pudo guardar. Verifica que tengas permisos de owner o admin.' };
  }

  return { success: true };
}

/** Roles asignables desde la interfaz de invitacion/gestion -- 'owner' se excluye a proposito: transferir la propiedad es una decision aparte, no una casilla mas en este selector. */
export type AssignableRole = Exclude<MemberRole, 'owner'>;

function isAssignableRole(value: string): value is AssignableRole {
  return value === 'admin' || value === 'editor' || value === 'viewer';
}

/**
 * Añade a un colaborador existente de Lumen a este espacio por su correo,
 * con el rol elegido (RBAC, Bloque P4: admin/editor/viewer -- ver
 * domain/permissions.ts para lo que cada uno puede hacer). No envia ningun
 * email real (no hay servicio de envio conectado): la persona invitada debe
 * ya tener cuenta en Lumen. Buscar el perfil por correo requiere la service
 * role porque profiles_select_shared_space (0004) solo deja ver perfiles de
 * gente con la que YA se comparte un espacio -- exactamente lo que todavia
 * no es cierto en este momento. El INSERT real en space_members si pasa por
 * el cliente con sesion, asi que RLS (space_members_insert_admin: solo
 * owner/admin) sigue siendo quien decide si la operacion se permite, no
 * esta funcion.
 */
export async function inviteMemberByEmail(
  spaceId: string,
  email: string,
  role: AssignableRole = 'editor',
): Promise<{ success: true } | { success: false; error: string }> {
  const supabase = await getSupabaseServerClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();
  if (authError || !user) {
    return { success: false, error: 'No autorizado' };
  }

  const trimmedEmail = email.trim().toLowerCase();
  if (!trimmedEmail) {
    return { success: false, error: 'Escribe un correo.' };
  }
  if (!isAssignableRole(role)) {
    return { success: false, error: 'Rol invalido.' };
  }

  const serviceRole = getSupabaseServiceRoleClient();
  if (!serviceRole) {
    return { success: false, error: 'No se pudo buscar esa cuenta. Intenta de nuevo.' };
  }

  const { data: profile } = await serviceRole.from('profiles').select('id').ilike('email', trimmedEmail).maybeSingle();
  if (!profile) {
    return { success: false, error: 'No hay ninguna cuenta de Lumen con ese correo. Pidele que se registre primero.' };
  }

  const { error } = await supabase
    .from('space_members')
    .insert({ space_id: spaceId, user_id: profile.id, role, invited_by: user.id });

  if (error) {
    if (error.code === '23505') {
      return { success: false, error: 'Esa persona ya es parte de este espacio.' };
    }
    console.error('Error al invitar miembro:', error);
    return { success: false, error: 'No se pudo añadir a esa persona. Verifica que tengas permisos de owner o admin.' };
  }

  return { success: true };
}

/**
 * Aviso en vivo de que se le revoco el acceso a alguien -- ademas de que RLS
 * ya bloquea cualquier consulta futura de esa persona (la garantia real de
 * seguridad, funciona aunque este broadcast fallara), esto hace que una
 * pestaña que la persona removida tenga abierta EN ESE MOMENTO se cierre de
 * inmediato en vez de esperar a que intente algo y reciba un error de RLS.
 * Best-effort con timeout corto: si la conexion Realtime no responde rapido,
 * no bloquea ni hace fallar la remocion en si (esa ya quedo aplicada en la
 * base de datos antes de llamar esto).
 */
async function broadcastToSpace(spaceId: string, event: string, payload: Record<string, unknown>): Promise<void> {
  try {
    const supabase = await getSupabaseServerClient();
    const channel = supabase.channel(`transactions-${spaceId}`);
    await Promise.race([
      new Promise<void>((resolve) => {
        channel.subscribe((status) => {
          if (status === 'SUBSCRIBED') {
            channel.send({ type: 'broadcast', event, payload }).finally(resolve);
          } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') {
            resolve();
          }
        });
      }),
      new Promise<void>((resolve) => setTimeout(resolve, 2500)),
    ]);
    await supabase.removeChannel(channel);
  } catch (err) {
    console.error(`No se pudo transmitir el aviso "${event}" en vivo (no crítico):`, err);
  }
}

/**
 * Remueve a un colaborador del espacio. RLS (space_members_delete_admin_or_self)
 * ya permite esto a owner/admin (o a la propia persona saliendo), pero aqui
 * ademas se protege explicitamente al owner original -- removerlo dejaria el
 * espacio sin due-o claro, un estado que la UI no sabe representar todavia.
 */
export async function removeMember(
  spaceId: string,
  userId: string,
): Promise<{ success: true } | { success: false; error: string }> {
  const supabase = await getSupabaseServerClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();
  if (authError || !user) {
    return { success: false, error: 'No autorizado' };
  }

  const { data: target } = await supabase
    .from('space_members')
    .select('role')
    .eq('space_id', spaceId)
    .eq('user_id', userId)
    .maybeSingle();

  if (target?.role === 'owner') {
    return { success: false, error: 'No puedes remover al propietario del espacio.' };
  }

  const { error, count } = await supabase
    .from('space_members')
    .delete({ count: 'exact' })
    .eq('space_id', spaceId)
    .eq('user_id', userId);

  if (error) {
    console.error('Error al remover miembro:', error);
    return { success: false, error: 'No se pudo remover a esa persona.' };
  }
  if (!count) {
    return { success: false, error: 'No tienes permiso para remover a esa persona.' };
  }

  await broadcastToSpace(spaceId, 'member_removed', { userId });

  return { success: true };
}

/**
 * Cambia el rol de un colaborador (RBAC, Bloque P4). 'owner' nunca es un
 * valor aceptado aqui -- transferir la propiedad queda fuera de este flujo a
 * proposito. Tampoco se puede tocar la fila de un owner desde esta funcion
 * (aunque solo hubiera uno, el trigger prevent_ownerless_space -- 0029 --
 * igual lo bloquearia; esto solo da un mensaje mas claro que un error de
 * base de datos). RLS (space_members_update_admin) exige owner/admin.
 */
export async function updateMemberRole(
  spaceId: string,
  userId: string,
  role: AssignableRole,
): Promise<{ success: true } | { success: false; error: string }> {
  const supabase = await getSupabaseServerClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();
  if (authError || !user) {
    return { success: false, error: 'No autorizado' };
  }

  if (!isAssignableRole(role)) {
    return { success: false, error: 'Rol invalido.' };
  }

  const { data: target } = await supabase
    .from('space_members')
    .select('role')
    .eq('space_id', spaceId)
    .eq('user_id', userId)
    .maybeSingle();

  if (target?.role === 'owner') {
    return { success: false, error: 'No puedes cambiar el rol del propietario del espacio.' };
  }

  const { error, count } = await supabase
    .from('space_members')
    .update({ role }, { count: 'exact' })
    .eq('space_id', spaceId)
    .eq('user_id', userId);

  if (error) {
    console.error('Error al cambiar el rol del miembro:', error);
    return { success: false, error: 'No se pudo cambiar el rol.' };
  }
  if (!count) {
    return { success: false, error: 'No tienes permiso para cambiar el rol de esa persona.' };
  }

  await broadcastToSpace(spaceId, 'member_role_changed', { userId, role });

  return { success: true };
}
