'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { getSupabaseBrowserClient } from '@/infrastructure/supabase/client';
import type { SpaceMemberSummary } from '@/domain/types/dashboard';

interface RealtimeSpaceSyncProps {
  spaceId: string;
  currentUserId: string;
  members: SpaceMemberSummary[];
}

interface TransactionChangePayload {
  status: string;
  type: string;
  description: string | null;
  created_by: string;
  confirmed_by: string | null;
}

const TYPE_LABEL: Record<string, string> = { income: 'un ingreso', expense: 'un gasto', transfer: 'una transferencia' };

function displayName(members: SpaceMemberSummary[], userId: string): string {
  const member = members.find((m) => m.userId === userId);
  if (!member) return 'Alguien mas';
  return member.fullName ?? member.email;
}

/** Misma navegacion "dura" que AccountDeletionSection -- una pestaña con sesion ya invalida no debe depender de una transicion de cliente de Next.js. */
function hardNavigate(path: string) {
  window.location.assign(path);
}

/**
 * Espacios colaborativos, verdad compartida: escucha cambios en vivo (via
 * Supabase Realtime, ya incluido en el plan $0 -- ver migracion 0015) sobre
 * `transactions` en ESTE espacio. Cuando otro miembro registra o confirma
 * algo, refresca el tablero y muestra un aviso breve y neutral -- nunca un
 * indicador de "en linea" permanente ni nada intrusivo. Los propios cambios
 * del usuario actual se ignoran aqui porque sus componentes (CommandConsole,
 * PendingConfirmationCard) ya refrescan por su cuenta.
 */
export function RealtimeSpaceSync({ spaceId, currentUserId, members }: RealtimeSpaceSyncProps) {
  const router = useRouter();
  const [notice, setNotice] = useState<string | null>(null);
  const [revoked, setRevoked] = useState(false);

  useEffect(() => {
    const supabase = getSupabaseBrowserClient();

    const channel = supabase
      .channel(`transactions-${spaceId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'transactions', filter: `space_id=eq.${spaceId}` },
        (payload) => {
          const row = payload.new as TransactionChangePayload | undefined;
          if (!row) return;

          const actorId = row.status === 'confirmed' ? row.confirmed_by : row.created_by;
          if (!actorId || actorId === currentUserId) {
            // Cambio propio: los componentes que lo originaron ya refrescan
            // por su cuenta, no hay nada nuevo que avisar aqui.
            return;
          }

          const who = displayName(members, actorId);
          const what =
            payload.eventType === 'INSERT'
              ? `${who} registro ${TYPE_LABEL[row.type] ?? 'un movimiento'}.`
              : row.status === 'confirmed'
                ? `${who} confirmo ${TYPE_LABEL[row.type] ?? 'un movimiento'}.`
                : `${who} actualizo este espacio.`;

          setNotice(what);
          router.refresh();
        },
      )
      // Revocacion de acceso en tiempo real: si un owner/admin remueve a
      // esta persona mientras tiene el tablero abierto, no espera a que
      // intente algo y choque con RLS -- se le avisa y se le saca de
      // inmediato (ver broadcastMemberRemoved en actions/settings.ts).
      .on('broadcast', { event: 'member_removed' }, (payload) => {
        if (payload.payload?.userId === currentUserId) {
          setRevoked(true);
        }
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [spaceId, currentUserId, members, router]);

  useEffect(() => {
    if (!revoked) return;
    const timer = setTimeout(() => hardNavigate('/executive-board'), 2500);
    return () => clearTimeout(timer);
  }, [revoked]);

  useEffect(() => {
    if (!notice) return;
    const timer = setTimeout(() => setNotice(null), 5000);
    return () => clearTimeout(timer);
  }, [notice]);

  if (revoked) {
    return (
      <div role="alertdialog" aria-modal="true" className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
        <div className="w-full max-w-sm rounded-2xl border border-white/10 bg-elevated p-6 text-center text-stone-100 shadow-2xl">
          <p className="text-sm">Tu acceso a este espacio fue revocado.</p>
          <p className="mt-1 text-xs text-stone-500">Te llevamos a tus espacios...</p>
        </div>
      </div>
    );
  }

  if (!notice) return null;

  return (
    <div className="fixed left-1/2 top-4 z-40 w-[calc(100vw-2rem)] max-w-sm -translate-x-1/2">
      <div className="animate-fade-scale-in rounded-lg border border-white/10 bg-elevated/95 px-4 py-2.5 text-center text-xs text-stone-300 shadow-2xl shadow-black/50 backdrop-blur">
        {notice}
      </div>
    </div>
  );
}
