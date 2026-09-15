'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { createInboundChannel, revokeInboundChannel, type InboundChannelSummary } from '@/actions/inbound-channels';

interface InboundChannelsManagerProps {
  spaceId: string;
  channels: InboundChannelSummary[];
  canManage: boolean;
}

const DATE_FORMAT = new Intl.DateTimeFormat('es-CO', { day: 'numeric', month: 'short', year: 'numeric' });

/**
 * Bandeja Automatica (Bloque P2-1): cada canal es un token secreto que
 * autoriza a un sistema externo (reenvio de correo, Zapier/Make, cualquier
 * webhook) a subir documentos a este espacio SIN sesion de usuario, via
 * POST a /api/inbound/documents. El token completo solo se ve una vez, al
 * crearlo -- la base de datos guarda solo su hash, igual que una contraseña.
 */
export function InboundChannelsManager({ spaceId, channels, canManage }: InboundChannelsManagerProps) {
  const router = useRouter();
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [label, setLabel] = useState('');
  const [newToken, setNewToken] = useState<string | null>(null);
  const [revokingId, setRevokingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState<'token' | 'url' | null>(null);
  const [isPending, startTransition] = useTransition();

  const webhookUrl = typeof window !== 'undefined' ? `${window.location.origin}/api/inbound/documents` : '/api/inbound/documents';

  function handleCreate() {
    setError(null);
    startTransition(async () => {
      const result = await createInboundChannel(spaceId, label);
      if (!result.success) {
        setError(result.error);
        return;
      }
      setNewToken(result.token);
      setLabel('');
      router.refresh();
    });
  }

  function handleRevoke(channelId: string) {
    setError(null);
    setRevokingId(channelId);
    revokeInboundChannel(spaceId, channelId).then((result) => {
      setRevokingId(null);
      if (!result.success) {
        setError(result.error);
        return;
      }
      router.refresh();
    });
  }

  async function copy(text: string, which: 'token' | 'url') {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(which);
      setTimeout(() => setCopied(null), 2000);
    } catch {
      // Clipboard puede fallar sin permiso (ej. contexto no seguro) -- el
      // texto sigue visible y seleccionable a mano, no es un callejon sin salida.
    }
  }

  return (
    <div className="flex flex-col gap-3">
      <p className="text-xs text-stone-500">
        Reenvia correos o conecta un webhook (Zapier, Make) a esta URL para que las facturas lleguen solas al Centro de Ingesta.
      </p>

      {channels.length === 0 && !showCreateForm && <p className="text-xs text-stone-500">Sin canales todavia.</p>}

      {channels.map((channel) => (
        <div key={channel.id} className="flex items-center justify-between gap-3 rounded-lg border border-white/10 bg-obsidian px-4 py-2.5">
          <div className="min-w-0">
            <p className="truncate text-sm text-stone-200">{channel.label}</p>
            <p className="mt-0.5 text-xs text-stone-500">
              {channel.lastUsedAt ? `Ultimo uso: ${DATE_FORMAT.format(new Date(channel.lastUsedAt))}` : 'Sin uso todavia'} · Creado{' '}
              {DATE_FORMAT.format(new Date(channel.createdAt))}
            </p>
          </div>
          {canManage && (
            <button
              type="button"
              disabled={revokingId === channel.id}
              onClick={() => handleRevoke(channel.id)}
              className="shrink-0 text-xs text-red-400 hover:text-red-300 disabled:opacity-50"
            >
              {revokingId === channel.id ? 'Revocando...' : 'Revocar'}
            </button>
          )}
        </div>
      ))}

      {error && <p className="text-xs text-red-400">{error}</p>}

      {newToken && (
        <div className="flex flex-col gap-2 rounded-lg border border-gold/30 bg-gold/10 p-4 text-xs">
          <p className="font-medium text-gold">Guarda este token ahora -- no se volvera a mostrar.</p>
          <div className="flex items-center gap-2">
            <code className="min-w-0 flex-1 overflow-x-auto rounded bg-obsidian px-2 py-1.5 text-stone-200">{newToken}</code>
            <button type="button" onClick={() => copy(newToken, 'token')} className="shrink-0 text-stone-400 hover:text-stone-200">
              {copied === 'token' ? 'Copiado' : 'Copiar'}
            </button>
          </div>
          <p className="text-stone-400">
            Envia el documento por POST (multipart/form-data, campo &quot;file&quot;) a:
          </p>
          <div className="flex items-center gap-2">
            <code className="min-w-0 flex-1 overflow-x-auto rounded bg-obsidian px-2 py-1.5 text-stone-200">{webhookUrl}</code>
            <button type="button" onClick={() => copy(webhookUrl, 'url')} className="shrink-0 text-stone-400 hover:text-stone-200">
              {copied === 'url' ? 'Copiado' : 'Copiar'}
            </button>
          </div>
          <p className="text-stone-500">
            Con el header &quot;Authorization: Bearer {'<token>'}&quot;, o como &quot;?token=&quot; en la URL.
          </p>
          <button type="button" onClick={() => setNewToken(null)} className="mt-1 self-start text-stone-400 hover:text-stone-200">
            Listo, ya lo guarde
          </button>
        </div>
      )}

      {canManage && !newToken && (
        showCreateForm ? (
          <div className="flex items-center gap-2">
            <input
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              placeholder="ej. Correo de facturas"
              className="min-w-0 flex-1 rounded-lg border border-white/10 bg-obsidian px-3 py-2 text-sm text-stone-100 placeholder:text-stone-600 focus:border-emerald-600 focus:outline-none focus:ring-1 focus:ring-emerald-600"
            />
            <button
              type="button"
              disabled={isPending}
              onClick={handleCreate}
              className="shrink-0 rounded-lg bg-wealth px-3 py-2 text-xs font-medium text-white transition hover:bg-wealth-hover disabled:opacity-50"
            >
              {isPending ? 'Generando...' : 'Generar'}
            </button>
            <button type="button" onClick={() => setShowCreateForm(false)} className="shrink-0 text-xs text-stone-400 hover:text-stone-200">
              Cancelar
            </button>
          </div>
        ) : (
          <button type="button" onClick={() => setShowCreateForm(true)} className="self-start text-xs font-medium text-gold hover:underline">
            + Nuevo canal
          </button>
        )
      )}
    </div>
  );
}
