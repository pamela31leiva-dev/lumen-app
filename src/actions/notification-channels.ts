'use server';

import { getSupabaseServerClient } from '@/infrastructure/supabase/server';
import { sendTelegramNotification, sendWebhookNotification } from '@/lib/notifications/send';

export type NotificationChannelType = 'webhook' | 'telegram';

export interface NotificationChannelSummary {
  id: string;
  channelType: NotificationChannelType;
  /** Solo lo necesario para reconocer el canal en la lista -- nunca el secreto completo (bot_token/url), mismo criterio que inbound_channels. */
  maskedTarget: string;
  isActive: boolean;
  createdAt: string;
}

interface WebhookConfig {
  url: string;
}
interface TelegramConfig {
  bot_token: string;
  chat_id: string;
}

function maskTarget(channelType: NotificationChannelType, config: WebhookConfig | TelegramConfig): string {
  if (channelType === 'webhook') {
    const url = (config as WebhookConfig).url;
    try {
      return new URL(url).hostname;
    } catch {
      return 'URL invalida';
    }
  }
  const chatId = (config as TelegramConfig).chat_id;
  return `Chat ${chatId}`;
}

/** Canales de notificacion del espacio, con el secreto enmascarado -- RLS (select_admin) ya exige owner/admin para llegar aqui. */
export async function listNotificationChannels(spaceId: string): Promise<NotificationChannelSummary[]> {
  const supabase = await getSupabaseServerClient();

  const { data, error } = await supabase
    .from('space_notification_channels')
    .select('id, channel_type, config, is_active, created_at')
    .eq('space_id', spaceId)
    .order('created_at', { ascending: false });

  if (error) {
    console.error('Error al leer los canales de notificacion:', error);
    return [];
  }

  return (data ?? []).map((row) => ({
    id: row.id,
    channelType: row.channel_type as NotificationChannelType,
    maskedTarget: maskTarget(row.channel_type as NotificationChannelType, row.config),
    isActive: row.is_active,
    createdAt: row.created_at,
  }));
}

function validateConfig(channelType: NotificationChannelType, config: Record<string, string>): string | null {
  if (channelType === 'webhook') {
    if (!config.url?.trim()) return 'Escribe la URL del webhook.';
    try {
      const parsed = new URL(config.url.trim());
      if (parsed.protocol !== 'https:') return 'La URL debe ser https.';
    } catch {
      return 'Esa URL no es valida.';
    }
    return null;
  }
  if (!config.bot_token?.trim()) return 'Escribe el token del bot (te lo da @BotFather en Telegram).';
  if (!config.chat_id?.trim()) return 'Escribe el chat_id (te lo da @userinfobot en Telegram).';
  return null;
}

/** Crea un canal de notificacion. RLS exige owner/admin (space_notification_channels_insert_admin). */
export async function createNotificationChannel(
  spaceId: string,
  channelType: NotificationChannelType,
  config: Record<string, string>,
): Promise<{ success: true } | { success: false; error: string }> {
  const supabase = await getSupabaseServerClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();
  if (authError || !user) return { success: false, error: 'No autorizado' };

  const validationError = validateConfig(channelType, config);
  if (validationError) return { success: false, error: validationError };

  const normalizedConfig =
    channelType === 'webhook' ? { url: config.url.trim() } : { bot_token: config.bot_token.trim(), chat_id: config.chat_id.trim() };

  const { error } = await supabase.from('space_notification_channels').insert({
    space_id: spaceId,
    channel_type: channelType,
    config: normalizedConfig,
    created_by: user.id,
  });

  if (error) {
    console.error('Error al crear el canal de notificacion:', error);
    return { success: false, error: 'No se pudo crear el canal (requiere rol Owner o Admin).' };
  }

  return { success: true };
}

/** Envia un mensaje de prueba por un canal ya creado -- para que la persona confirme que funciona antes de confiar en el aviso real. */
export async function sendTestNotification(spaceId: string, channelId: string): Promise<{ success: true } | { success: false; error: string }> {
  const supabase = await getSupabaseServerClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();
  if (authError || !user) return { success: false, error: 'No autorizado' };

  const { data: channel, error } = await supabase
    .from('space_notification_channels')
    .select('channel_type, config')
    .eq('id', channelId)
    .eq('space_id', spaceId)
    .single();

  if (error || !channel) return { success: false, error: 'No se encontro el canal.' };

  const text = '✅ Lumen: este es un mensaje de prueba. Si lo ves, el canal esta bien configurado.';
  const result =
    channel.channel_type === 'webhook'
      ? await sendWebhookNotification((channel.config as WebhookConfig).url, text)
      : await sendTelegramNotification((channel.config as TelegramConfig).bot_token, (channel.config as TelegramConfig).chat_id, text);

  if (!result.success) {
    return { success: false, error: result.error ?? 'No se pudo enviar el mensaje de prueba.' };
  }
  return { success: true };
}

/** Activa/pausa un canal sin borrarlo. RLS exige owner/admin. */
export async function toggleNotificationChannel(
  spaceId: string,
  channelId: string,
  isActive: boolean,
): Promise<{ success: true } | { success: false; error: string }> {
  const supabase = await getSupabaseServerClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();
  if (authError || !user) return { success: false, error: 'No autorizado' };

  const { error, count } = await supabase
    .from('space_notification_channels')
    .update({ is_active: isActive }, { count: 'exact' })
    .eq('id', channelId)
    .eq('space_id', spaceId);

  if (error) {
    console.error('Error al activar/pausar el canal:', error);
    return { success: false, error: 'No se pudo actualizar el canal.' };
  }
  if (!count) return { success: false, error: 'No tienes permiso para modificar este canal (requiere rol Owner o Admin).' };

  return { success: true };
}

/** Elimina un canal de notificacion. RLS exige owner/admin. */
export async function deleteNotificationChannel(spaceId: string, channelId: string): Promise<{ success: true } | { success: false; error: string }> {
  const supabase = await getSupabaseServerClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();
  if (authError || !user) return { success: false, error: 'No autorizado' };

  const { error, count } = await supabase.from('space_notification_channels').delete({ count: 'exact' }).eq('id', channelId).eq('space_id', spaceId);

  if (error) {
    console.error('Error al eliminar el canal de notificacion:', error);
    return { success: false, error: 'No se pudo eliminar el canal.' };
  }
  if (!count) return { success: false, error: 'No tienes permiso para eliminar este canal (requiere rol Owner o Admin).' };

  return { success: true };
}
