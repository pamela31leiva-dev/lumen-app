'use client';

import { useState, useTransition, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { inviteMemberByEmail, removeMember } from '@/actions/settings';
import type { SpaceMemberSummary } from '@/domain/types/dashboard';
import { cn } from '@/lib/utils';

const ROLE_LABEL: Record<string, string> = {
  owner: 'Owner',
  admin: 'Admin',
  editor: 'Editor',
  viewer: 'Solo lectura',
};

interface SpaceMembersManagerProps {
  spaceId: string;
  members: SpaceMemberSummary[];
  canManage: boolean;
}

/**
 * "Colaboracion Real": conecta visualmente space_members, que ya opera en
 * Supabase (RLS decide quien puede invitar/remover -- ver
 * space_members_insert_admin / _delete_admin_or_self). No envia correos de
 * verdad: la persona invitada debe ya tener cuenta en Lumen, asi que el
 * error mas comun ("no existe esa cuenta") se explica de forma directa en
 * vez de simular un envio que no pasa nada.
 */
export function SpaceMembersManager({ spaceId, members, canManage }: SpaceMembersManagerProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [email, setEmail] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [removingIds, setRemovingIds] = useState<Set<string>>(new Set());

  function handleInvite(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setSuccess(null);
    const trimmed = email.trim();
    if (!trimmed) return;

    startTransition(async () => {
      const result = await inviteMemberByEmail(spaceId, trimmed);
      if (!result.success) {
        setError(result.error);
        return;
      }
      setEmail('');
      setSuccess('Listo, ya es parte de este espacio.');
      router.refresh();
    });
  }

  function handleRemove(userId: string) {
    setError(null);
    setRemovingIds((prev) => new Set(prev).add(userId));
    startTransition(async () => {
      const result = await removeMember(spaceId, userId);
      if (!result.success) {
        setError(result.error);
        setRemovingIds((prev) => {
          const next = new Set(prev);
          next.delete(userId);
          return next;
        });
        return;
      }
      router.refresh();
    });
  }

  const visibleMembers = members.filter((m) => !removingIds.has(m.userId));

  return (
    <div>
      {canManage && (
        <form onSubmit={handleInvite} className="mb-4 flex flex-col gap-2 sm:flex-row">
          <input
            type="email"
            required
            placeholder="correo@ejemplo.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            disabled={isPending}
            className="min-w-0 flex-1 rounded-lg border border-white/10 bg-obsidian px-3 py-2 text-sm text-stone-100 placeholder:text-stone-600 focus:border-emerald-600 focus:outline-none focus:ring-1 focus:ring-emerald-600 disabled:opacity-60"
          />
          <button
            type="submit"
            disabled={isPending || !email.trim()}
            className="shrink-0 rounded-lg bg-wealth px-4 py-2 text-sm font-medium text-white transition hover:bg-wealth-hover disabled:opacity-50"
          >
            {isPending ? 'Añadiendo...' : 'Invitar / Añadir'}
          </button>
        </form>
      )}

      {error && <p className="mb-2 text-xs text-red-400">{error}</p>}
      {success && <p className="mb-2 text-xs text-growth">{success}</p>}

      <ul className="flex flex-col divide-y divide-white/10">
        {visibleMembers.map((member) => (
          <li key={member.userId} className="animate-fade-scale-in flex items-center justify-between gap-3 py-3">
            <div className="min-w-0">
              <p className="truncate text-sm text-stone-100">{member.fullName ?? member.email}</p>
              {member.fullName && <p className="truncate text-xs text-stone-500">{member.email}</p>}
            </div>
            <div className="flex shrink-0 items-center gap-2">
              <span className="rounded-full bg-emerald-600/15 px-2.5 py-1 text-[11px] font-medium text-emerald-400">
                {ROLE_LABEL[member.role] ?? member.role}
              </span>
              {canManage && member.role !== 'owner' && (
                <button
                  type="button"
                  onClick={() => handleRemove(member.userId)}
                  disabled={isPending}
                  title="Remover del espacio"
                  aria-label="Remover del espacio"
                  className={cn('rounded-md p-1.5 text-stone-500 transition hover:bg-red-500/10 hover:text-red-400 disabled:opacity-50')}
                >
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75} className="h-4 w-4">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M6 6l12 12M18 6 6 18" />
                  </svg>
                </button>
              )}
            </div>
          </li>
        ))}
        {visibleMembers.length === 0 && <p className="py-3 text-sm text-stone-500">No hay miembros para mostrar.</p>}
      </ul>
    </div>
  );
}
