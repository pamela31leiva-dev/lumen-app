'use server';

import { getSupabaseServerClient } from '@/infrastructure/supabase/server';

/**
 * Centro de Privacidad — Habeas Data (Ley 1581 de 2012).
 *
 * Todas las consultas aqui corren con el cliente de sesion normal (RLS
 * activo, sin service_role): un usuario solo puede exportar o purgar lo que
 * las politicas ya le permiten ver, lo cual coincide exactamente con "sus
 * datos" segun el modelo de espacios.
 */

export interface UserDataExport {
  generatedAt: string;
  profile: Record<string, unknown> | null;
  spaces: Record<string, unknown>[];
  accountsCreated: Record<string, unknown>[];
  receiptsUploaded: Record<string, unknown>[];
  transactions: Record<string, unknown>[];
  auditLogEntries: Record<string, unknown>[];
  disclaimer: string;
}

export async function exportUserData(): Promise<{ success: true; data: UserDataExport } | { success: false; error: string }> {
  const supabase = await getSupabaseServerClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();
  if (authError || !user) {
    return { success: false, error: 'No autorizado' };
  }

  const [profileRes, membershipsRes, accountsRes, receiptsRes, transactionsRes, auditRes] = await Promise.all([
    supabase.from('profiles').select('*').eq('id', user.id).maybeSingle(),
    supabase.from('space_members').select('role, joined_at, space:spaces(id, name, type, base_currency)').eq('user_id', user.id),
    supabase.from('accounts').select('*').eq('created_by', user.id),
    supabase.from('receipts').select('*').eq('uploaded_by', user.id),
    supabase.from('transactions').select('*').or(`created_by.eq.${user.id},confirmed_by.eq.${user.id}`),
    supabase.from('audit_logs').select('*').eq('actor_id', user.id),
  ]);

  return {
    success: true,
    data: {
      generatedAt: new Date().toISOString(),
      profile: profileRes.data ?? null,
      spaces: membershipsRes.data ?? [],
      accountsCreated: accountsRes.data ?? [],
      receiptsUploaded: receiptsRes.data ?? [],
      transactions: transactionsRes.data ?? [],
      auditLogEntries: auditRes.data ?? [],
      disclaimer:
        'Informacion analitica descriptiva; no constituye asesoria financiera ni tributaria. Este export cubre los datos visibles para tu usuario segun tus membresias de espacio.',
    },
  };
}

interface PurgeStepResult {
  spaceId: string;
  spaceName: string;
  action: 'space_deleted' | 'left_space';
}

/**
 * Purga los datos del usuario:
 *  - Si es el unico miembro de un espacio, elimina el espacio completo
 *    (ON DELETE CASCADE se lleva cuentas/categorias/recibos/transacciones/auditoria).
 *  - Si el espacio es compartido, el usuario simplemente lo abandona
 *    (se revoca su acceso RLS de inmediato). Si era el unico owner, se
 *    promueve automaticamente a otro miembro antes de salir para no dejar
 *    el espacio huerfano.
 *
 * No elimina la cuenta de autenticacion (auth.users): eso es una operacion
 * administrativa distinta que requiere la Admin API de Supabase con
 * service_role, fuera del alcance de una Server Action con sesion de usuario.
 */
export async function purgeUserData(): Promise<{ success: true; steps: PurgeStepResult[] } | { success: false; error: string }> {
  const supabase = await getSupabaseServerClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();
  if (authError || !user) {
    return { success: false, error: 'No autorizado' };
  }

  const { data: memberships, error: membershipsError } = await supabase
    .from('space_members')
    .select('space_id, role, spaces(name)')
    .eq('user_id', user.id);

  if (membershipsError) {
    console.error('Error al leer membresias para purga:', membershipsError);
    return { success: false, error: 'No se pudieron leer tus espacios.' };
  }

  const steps: PurgeStepResult[] = [];

  for (const membership of memberships ?? []) {
    const spaceId = membership.space_id;
    const spaceName = (membership.spaces as { name?: string } | null)?.name ?? spaceId;

    const { data: allMembers, error: allMembersError } = await supabase
      .from('space_members')
      .select('id, user_id, role, joined_at')
      .eq('space_id', spaceId);

    if (allMembersError || !allMembers) {
      console.error('Error al leer miembros del espacio', spaceId, allMembersError);
      continue;
    }

    if (allMembers.length <= 1) {
      const { error: deleteError } = await supabase.from('spaces').delete().eq('id', spaceId);
      if (deleteError) {
        console.error('Error al eliminar espacio', spaceId, deleteError);
        continue;
      }
      steps.push({ spaceId, spaceName, action: 'space_deleted' });
      continue;
    }

    if (membership.role === 'owner') {
      const otherOwner = allMembers.find((m) => m.user_id !== user.id && m.role === 'owner');
      if (!otherOwner) {
        const rolePriority: Record<string, number> = { admin: 0, editor: 1, viewer: 2 };
        const successor = allMembers
          .filter((m) => m.user_id !== user.id)
          .sort((a, b) => {
            const byRole = (rolePriority[a.role] ?? 3) - (rolePriority[b.role] ?? 3);
            if (byRole !== 0) return byRole;
            return new Date(a.joined_at).getTime() - new Date(b.joined_at).getTime();
          })[0];

        if (successor) {
          const { error: promoteError } = await supabase
            .from('space_members')
            .update({ role: 'owner' })
            .eq('id', successor.id);
          if (promoteError) {
            console.error('Error al promover sucesor en espacio', spaceId, promoteError);
            continue;
          }
        }
      }
    }

    const { error: leaveError } = await supabase
      .from('space_members')
      .delete()
      .eq('space_id', spaceId)
      .eq('user_id', user.id);

    if (leaveError) {
      console.error('Error al abandonar espacio', spaceId, leaveError);
      continue;
    }

    steps.push({ spaceId, spaceName, action: 'left_space' });
  }

  return { success: true, steps };
}
