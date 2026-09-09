'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { renameSpace } from '@/actions/settings';
import { cn } from '@/lib/utils';

interface RenameSpaceFormProps {
  spaceId: string;
  currentName: string;
  canEdit: boolean;
}

export function RenameSpaceForm({ spaceId, currentName, canEdit }: RenameSpaceFormProps) {
  const router = useRouter();
  const [name, setName] = useState(currentName);
  const [isPending, startTransition] = useTransition();
  const [feedback, setFeedback] = useState<{ kind: 'success' | 'error'; message: string } | null>(null);

  function handleSave() {
    setFeedback(null);
    startTransition(async () => {
      const result = await renameSpace(spaceId, name);
      if (!result.success) {
        setFeedback({ kind: 'error', message: result.error });
        return;
      }
      setFeedback({ kind: 'success', message: 'Nombre actualizado.' });
      router.refresh();
    });
  }

  return (
    <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:gap-3">
      <div className="flex-1">
        <label htmlFor="space-name-edit" className="mb-1 block text-xs font-medium text-stone-300">
          Nombre del espacio
        </label>
        <input
          id="space-name-edit"
          value={name}
          onChange={(e) => setName(e.target.value)}
          disabled={!canEdit}
          className="w-full rounded-lg border border-white/10 bg-obsidian px-3 py-2 text-sm text-stone-100 focus:border-emerald-600 focus:outline-none focus:ring-1 focus:ring-emerald-600 disabled:opacity-50"
        />
      </div>
      <button
        type="button"
        onClick={handleSave}
        disabled={!canEdit || isPending || name.trim() === currentName.trim()}
        className={cn(
          'rounded-lg bg-wealth px-4 py-2 text-sm font-medium text-white transition hover:bg-wealth-hover disabled:cursor-not-allowed disabled:opacity-40',
        )}
      >
        {isPending ? 'Guardando...' : 'Guardar'}
      </button>
      {!canEdit && <p className="text-xs text-stone-500 sm:ml-2">Solo el owner o un admin puede renombrar el espacio.</p>}
      {feedback && (
        <p className={cn('text-xs sm:ml-2', feedback.kind === 'success' ? 'text-emerald-400' : 'text-red-400')}>
          {feedback.message}
        </p>
      )}
    </div>
  );
}
