'use client';

import { useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { setActiveSpace } from '@/actions/dashboard';
import { CreateSpaceDialog } from '@/components/dashboard/CreateSpaceDialog';
import type { SpaceSummary, SpaceType } from '@/domain/types/dashboard';

const SPACE_TYPE_LABEL: Record<SpaceType, string> = {
  personal: 'Personal',
  family: 'Familiar',
  business: 'Negocio',
  project: 'Proyecto',
};

interface SpaceSwitcherProps {
  spaces: SpaceSummary[];
  activeSpaceId: string | null;
}

export function SpaceSwitcher({ spaces, activeSpaceId }: SpaceSwitcherProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  const activeSpace = spaces.find((s) => s.id === activeSpaceId) ?? spaces[0] ?? null;

  function handleSelect(spaceId: string) {
    if (spaceId === activeSpace?.id) return;
    startTransition(async () => {
      await setActiveSpace(spaceId);
      router.refresh();
    });
  }

  return (
    <div className="flex items-center gap-2">
      <label className="sr-only" htmlFor="space-select">
        Espacio activo
      </label>
      <select
        id="space-select"
        value={activeSpace?.id ?? ''}
        onChange={(e) => handleSelect(e.target.value)}
        disabled={isPending || spaces.length === 0}
        className="rounded-lg border border-white/10 bg-elevated px-3 py-2 text-sm text-stone-100 focus:border-emerald-600 focus:outline-none focus:ring-1 focus:ring-emerald-600 disabled:opacity-50"
      >
        {spaces.length === 0 && <option value="">Sin espacios</option>}
        {spaces.map((space) => (
          <option key={space.id} value={space.id}>
            {space.name} · {SPACE_TYPE_LABEL[space.type]}
          </option>
        ))}
      </select>

      <CreateSpaceDialog />
    </div>
  );
}
