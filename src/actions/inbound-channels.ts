'use server';

import { randomBytes, createHash } from 'node:crypto';
import { getSupabaseServerClient } from '@/infrastructure/supabase/server';

export interface InboundChannelSummary {
  id: string;
  label: string;
  isActive: boolean;
  lastUsedAt: string | null;
  createdAt: string;
}

function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

/** Prefijo reconocible (como un API key de cualquier proveedor) -- nunca se guarda en claro, solo su hash en inbound_channels.token_hash. */
function generateToken(): string {
  return `lumen_ib_${randomBytes(24).toString('base64url')}`;
}

/** Canales de la Bandeja Automatica del espacio (sin el token -- ese solo se muestra una vez, al crearlo). */
export async function listInboundChannels(spaceId: string): Promise<InboundChannelSummary[]> {
  const supabase = await getSupabaseServerClient();

  const { data, error } = await supabase
    .from('inbound_channels')
    .select('id, label, is_active, last_used_at, created_at')
    .eq('space_id', spaceId)
    .order('created_at', { ascending: false });

  if (error) {
    console.error('Error al leer los canales de la Bandeja Automatica:', error);
    return [];
  }

  return (data ?? []).map((row) => ({
    id: row.id,
    label: row.label,
    isActive: row.is_active,
    lastUsedAt: row.last_used_at,
    createdAt: row.created_at,
  }));
}

/**
 * Genera un nuevo canal (token secreto) para que un sistema externo
 * (reenvio de correo, Zapier/Make, cualquier webhook autorizado) pueda subir
 * documentos a este espacio via POST a /api/inbound/documents. El token
 * completo SOLO se devuelve aqui, una vez -- la base de datos guarda unicamente
 * su hash (igual que una contraseña), asi que si se pierde no hay forma de
 * recuperarlo, solo de generar uno nuevo.
 */
export async function createInboundChannel(
  spaceId: string,
  label: string,
): Promise<{ success: true; token: string; channel: InboundChannelSummary } | { success: false; error: string }> {
  const supabase = await getSupabaseServerClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();
  if (authError || !user) return { success: false, error: 'No autorizado' };

  const trimmedLabel = label.trim() || 'Canal automatico';
  const token = generateToken();

  const { data, error } = await supabase
    .from('inbound_channels')
    .insert({
      space_id: spaceId,
      label: trimmedLabel,
      token_hash: hashToken(token),
      created_by: user.id,
    })
    .select('id, label, is_active, last_used_at, created_at')
    .single();

  if (error || !data) {
    console.error('Error al crear el canal de la Bandeja Automatica:', error);
    return { success: false, error: 'No se pudo crear el canal (requiere rol Owner o Admin).' };
  }

  return {
    success: true,
    token,
    channel: {
      id: data.id,
      label: data.label,
      isActive: data.is_active,
      lastUsedAt: data.last_used_at,
      createdAt: data.created_at,
    },
  };
}

/** Revoca (elimina) un canal permanentemente -- un token comprometido nunca deberia poder reactivarse. RLS exige owner/admin. */
export async function revokeInboundChannel(spaceId: string, channelId: string): Promise<{ success: true } | { success: false; error: string }> {
  const supabase = await getSupabaseServerClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();
  if (authError || !user) return { success: false, error: 'No autorizado' };

  const { error, count } = await supabase.from('inbound_channels').delete({ count: 'exact' }).eq('id', channelId).eq('space_id', spaceId);

  if (error) {
    console.error('Error al revocar el canal de la Bandeja Automatica:', error);
    return { success: false, error: 'No se pudo revocar el canal.' };
  }
  if (!count) return { success: false, error: 'No se encontro el canal, o no tienes permiso (requiere rol Owner o Admin).' };

  return { success: true };
}
