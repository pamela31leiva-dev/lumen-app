import { NextResponse } from 'next/server';
import { getSupabaseServiceRoleClient } from '@/infrastructure/supabase/service-role-client';
import { sendTelegramNotification, sendWebhookNotification } from '@/lib/notifications/send';
import { reportError } from '@/lib/telemetry/reporter';

/**
 * Motor de Recordatorios Proactivos (Bloque P6): corre periodicamente (ver
 * vercel.json) y evalua, para TODOS los espacios a la vez (via
 * service_role -- es un trabajo de sistema, no de un usuario con sesion),
 * que facturas pendientes entran en su ventana de aviso (bill_reminder_days
 * por espacio) y todavia no recibieron su aviso (reminder_sent_at is null).
 * Una factura recibe UN aviso proactivo por los canales activos del espacio
 * (webhook y/o Telegram) -- nunca un recordatorio diario repetido. Sin
 * canal activo, la factura sigue visible en la app (BillAlerts) igual que
 * siempre; esto solo agrega el empujon hacia AFUERA de la app.
 */

interface BillRow {
  id: string;
  space_id: string;
  description: string;
  amount: number;
  currency: string;
  due_date: string;
  space: { name: string; bill_reminder_days: number } | null;
}

interface ChannelRow {
  id: string;
  space_id: string;
  channel_type: 'webhook' | 'telegram';
  config: { url?: string; bot_token?: string; chat_id?: string };
}

const DAY_MS = 86_400_000;

export async function GET(request: Request) {
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret) {
    const authHeader = request.headers.get('authorization');
    if (authHeader !== `Bearer ${cronSecret}`) {
      return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
    }
  }

  const supabase = getSupabaseServiceRoleClient();
  if (!supabase) {
    return NextResponse.json({ error: 'Servicio no disponible.' }, { status: 503 });
  }

  const todayStart = new Date();
  todayStart.setUTCHours(0, 0, 0, 0);
  const todayIso = todayStart.toISOString().slice(0, 10);

  const { data: bills, error: billsError } = await supabase
    .from('bills')
    .select('id, space_id, description, amount, currency, due_date, space:spaces(name, bill_reminder_days)')
    .eq('status', 'pending')
    .is('reminder_sent_at', null)
    .gte('due_date', todayIso)
    .returns<BillRow[]>();

  if (billsError) {
    await reportError({ source: 'bill-reminders-cron', message: billsError.message, context: { step: 'read-bills' } });
    return NextResponse.json({ error: 'No se pudieron leer las facturas.' }, { status: 500 });
  }

  function daysUntilDue(dueDate: string): number {
    return Math.round((new Date(`${dueDate}T00:00:00Z`).getTime() - todayStart.getTime()) / DAY_MS);
  }

  const dueBills = (bills ?? []).filter((b) => daysUntilDue(b.due_date) <= (b.space?.bill_reminder_days ?? 3));

  if (dueBills.length === 0) {
    return NextResponse.json({ ok: true, evaluated: 0, notified: 0 });
  }

  const spaceIds = Array.from(new Set(dueBills.map((b) => b.space_id)));
  const { data: channels, error: channelsError } = await supabase
    .from('space_notification_channels')
    .select('id, space_id, channel_type, config')
    .in('space_id', spaceIds)
    .eq('is_active', true)
    .returns<ChannelRow[]>();

  if (channelsError) {
    await reportError({ source: 'bill-reminders-cron', message: channelsError.message, context: { step: 'read-channels' } });
  }

  const channelsBySpace = new Map<string, ChannelRow[]>();
  for (const channel of channels ?? []) {
    const list = channelsBySpace.get(channel.space_id) ?? [];
    list.push(channel);
    channelsBySpace.set(channel.space_id, list);
  }

  let notifiedCount = 0;
  for (const bill of dueBills) {
    const spaceChannels = channelsBySpace.get(bill.space_id) ?? [];
    if (spaceChannels.length === 0) continue;

    const days = daysUntilDue(bill.due_date);
    const whenLabel = days <= 0 ? 'vence HOY' : `vence en ${days} dia${days === 1 ? '' : 's'}`;
    const text = `📄 ${bill.space?.name ?? 'Tu espacio'}: "${bill.description}" ${whenLabel} (${Number(bill.amount).toLocaleString('es-CO')} ${bill.currency}).`;

    let anySucceeded = false;
    for (const channel of spaceChannels) {
      const result =
        channel.channel_type === 'webhook'
          ? await sendWebhookNotification(channel.config.url ?? '', text)
          : await sendTelegramNotification(channel.config.bot_token ?? '', channel.config.chat_id ?? '', text);

      if (result.success) {
        anySucceeded = true;
      } else {
        console.error(`Error enviando aviso de factura ${bill.id} por canal ${channel.id} (${channel.channel_type}):`, result.error);
      }
    }

    if (anySucceeded) {
      const { error: stampError } = await supabase.from('bills').update({ reminder_sent_at: new Date().toISOString() }).eq('id', bill.id);
      if (stampError) {
        console.error(`Error al marcar reminder_sent_at de la factura ${bill.id}:`, stampError);
      } else {
        notifiedCount++;
      }
    }
  }

  return NextResponse.json({ ok: true, evaluated: dueBills.length, notified: notifiedCount });
}
