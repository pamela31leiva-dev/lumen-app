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

// El derecho de Supresion (Habeas Data) se ejerce via deleteMyAccount
// (actions/account.ts), no aqui. Este archivo tenia antes un purgeUserData
// que, para un espacio compartido sin otro owner, promovia en silencio a
// otro miembro como dueño sin pedirle confirmacion a nadie -- un estandar
// mas laxo y contradictorio con deleteMyAccount, que bloquea esa misma
// situacion hasta que la persona transfiera la propiedad a mano. Se elimino
// para que exista un unico flujo de eliminacion de cuenta en toda la app.
