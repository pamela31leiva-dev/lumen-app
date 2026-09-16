'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import {
  createNotificationChannel,
  deleteNotificationChannel,
  sendTestNotification,
  toggleNotificationChannel,
  type NotificationChannelSummary,
  type NotificationChannelType,
} from '@/actions/notification-channels';
import { CustomSelect } from '@/components/ui/CustomSelect';

interface NotificationChannelsManagerProps {
  spaceId: string;
  channels: NotificationChannelSummary[];
  /** RBAC: solo owner/admin (mismo umbral que space_notification_channels, mas estricto que el resto por guardar credenciales en claro). */
  canManage: boolean;
}

const CHANNEL_LABEL: Record<NotificationChannelType, string> = { webhook: 'Webhook', telegram: 'Telegram' };

const TYPE_OPTIONS: { value: NotificationChannelType; label: string; hint: string }[] = [
  { value: 'webhook', label: 'Webhook', hint: 'Slack, Discord, Zapier, tu servidor' },
  { value: 'telegram', label: 'Telegram', hint: 'Tu propio bot' },
];

/**
 * Canales de Notificacion Proactiva (Bloque P6): cuando una factura entra
 * en su ventana de aviso (Preferencias de Alertas, arriba), el cron
 * /api/cron/bill-reminders manda un mensaje por cada canal activo del
 * espacio. Las credenciales (URL del webhook, token del bot) se guardan en
 * claro porque el servidor las necesita para enviar -- por eso esta seccion
 * es owner/admin en todo, mas estricto que el resto de Ajustes.
 */
export function NotificationChannelsManager({ spaceId, channels, canManage }: NotificationChannelsManagerProps) {
  const router = useRouter();
  const [showForm, setShowForm] = useState(false);
  const [channelType, setChannelType] = useState<NotificationChannelType>('webhook');
  const [url, setUrl] = useState('');
  const [botToken, setBotToken] = useState('');
  const [chatId, setChatId] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [testMessage, setTestMessage] = useState<{ id: string; text: string } | null>(null);
  const [isPending, startTransition] = useTransition();

  function resetForm() {
    setUrl('');
    setBotToken('');
    setChatId('');
    setShowForm(false);
    setError(null);
  }

  function handleCreate() {
    setError(null);
    const config: Record<string, string> = channelType === 'webhook' ? { url } : { bot_token: botToken, chat_id: chatId };
    startTransition(async () => {
      const result = await createNotificationChannel(spaceId, channelType, config);
      if (!result.success) {
        setError(result.error);
        return;
      }
      resetForm();
      router.refresh();
    });
  }

  function handleToggle(channel: NotificationChannelSummary) {
    setError(null);
    setBusyId(channel.id);
    toggleNotificationChannel(spaceId, channel.id, !channel.isActive).then((result) => {
      setBusyId(null);
      if (!result.success) {
        setError(result.error);
        return;
      }
      router.refresh();
    });
  }

  function handleDelete(channelId: string) {
    setError(null);
    setBusyId(channelId);
    deleteNotificationChannel(spaceId, channelId).then((result) => {
      setBusyId(null);
      if (!result.success) {
        setError(result.error);
        return;
      }
      router.refresh();
    });
  }

  function handleTest(channelId: string) {
    setError(null);
    setTestMessage(null);
    setBusyId(channelId);
    sendTestNotification(spaceId, channelId).then((result) => {
      setBusyId(null);
      setTestMessage({ id: channelId, text: result.success ? 'Enviado -- revisa el canal.' : result.error });
    });
  }

  return (
    <div className="flex flex-col gap-3">
      {channels.length === 0 && !showForm && <p className="text-xs text-stone-500">Sin canales todavia.</p>}

      {channels.map((channel) => (
        <div key={channel.id} className="flex items-center justify-between gap-3 rounded-lg border border-white/10 bg-obsidian px-4 py-2.5">
          <div className="min-w-0">
            <p className="truncate text-sm text-stone-200">
              {CHANNEL_LABEL[channel.channelType]} · {channel.maskedTarget}
              {!channel.isActive && <span className="ml-2 text-[10px] uppercase tracking-wide text-stone-600">Pausado</span>}
            </p>
            {testMessage?.id === channel.id && <p className="mt-0.5 text-xs text-stone-500">{testMessage.text}</p>}
          </div>
          {canManage && (
            <div className="flex shrink-0 items-center gap-3">
              <button type="button" disabled={busyId === channel.id} onClick={() => handleTest(channel.id)} className="text-xs text-stone-400 hover:text-stone-200 disabled:opacity-50">
                Probar
              </button>
              <button type="button" disabled={busyId === channel.id} onClick={() => handleToggle(channel)} className="text-xs text-stone-400 hover:text-stone-200 disabled:opacity-50">
                {channel.isActive ? 'Pausar' : 'Reactivar'}
              </button>
              <button type="button" disabled={busyId === channel.id} onClick={() => handleDelete(channel.id)} className="text-xs text-red-400 hover:text-red-300 disabled:opacity-50">
                Eliminar
              </button>
            </div>
          )}
        </div>
      ))}

      {error && <p className="text-xs text-red-400">{error}</p>}

      {canManage &&
        (showForm ? (
          <div className="flex flex-col gap-3 rounded-lg border border-white/10 bg-obsidian p-4">
            <div>
              <label className="mb-1 block text-xs font-medium text-stone-300">Tipo de canal</label>
              <CustomSelect value={channelType} onChange={(v) => setChannelType(v as NotificationChannelType)} options={TYPE_OPTIONS} />
            </div>

            {channelType === 'webhook' ? (
              <div>
                <label className="mb-1 block text-xs font-medium text-stone-300">URL del webhook</label>
                <input
                  value={url}
                  onChange={(e) => setUrl(e.target.value)}
                  placeholder="https://hooks.slack.com/services/..."
                  className="w-full rounded-lg border border-white/10 bg-elevated px-3 py-2 text-sm text-stone-100 placeholder:text-stone-600 focus:border-emerald-600 focus:outline-none focus:ring-1 focus:ring-emerald-600"
                />
              </div>
            ) : (
              <>
                <div>
                  <label className="mb-1 block text-xs font-medium text-stone-300">Token del bot</label>
                  <input
                    value={botToken}
                    onChange={(e) => setBotToken(e.target.value)}
                    placeholder="123456:ABC-... (de @BotFather)"
                    className="w-full rounded-lg border border-white/10 bg-elevated px-3 py-2 text-sm text-stone-100 placeholder:text-stone-600 focus:border-emerald-600 focus:outline-none focus:ring-1 focus:ring-emerald-600"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium text-stone-300">Chat ID</label>
                  <input
                    value={chatId}
                    onChange={(e) => setChatId(e.target.value)}
                    placeholder="Tu chat_id (de @userinfobot)"
                    className="w-full rounded-lg border border-white/10 bg-elevated px-3 py-2 text-sm text-stone-100 placeholder:text-stone-600 focus:border-emerald-600 focus:outline-none focus:ring-1 focus:ring-emerald-600"
                  />
                </div>
              </>
            )}

            <div className="flex justify-end gap-2">
              <button type="button" onClick={resetForm} className="rounded-lg px-3 py-2 text-xs font-medium text-stone-400 hover:text-stone-200">
                Cancelar
              </button>
              <button
                type="button"
                disabled={isPending}
                onClick={handleCreate}
                className="rounded-lg bg-wealth px-3 py-2 text-xs font-medium text-white transition hover:bg-wealth-hover disabled:cursor-not-allowed disabled:opacity-40"
              >
                {isPending ? 'Guardando...' : 'Crear canal'}
              </button>
            </div>
          </div>
        ) : (
          <button type="button" onClick={() => setShowForm(true)} className="self-start text-xs font-medium text-gold hover:underline">
            + Nuevo canal
          </button>
        ))}
    </div>
  );
}
