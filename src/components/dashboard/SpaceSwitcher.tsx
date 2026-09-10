'use client';

import { useEffect, useRef, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { setActiveSpace } from '@/actions/dashboard';
import { CreateSpaceDialog } from '@/components/dashboard/CreateSpaceDialog';
import type { SpaceSummary, SpaceType } from '@/domain/types/dashboard';
import { cn } from '@/lib/utils';

const SPACE_TYPE_LABEL: Record<SpaceType, string> = {
  personal: 'Personal',
  family: 'Familiar',
  business: 'Negocio',
  project: 'Proyecto',
};

/** Un icono de linea por tipo de espacio — misma familia visual que el boton de microfono/camara de la Consola de Comando. */
function SpaceTypeIcon({ type, className }: { type: SpaceType; className?: string }) {
  const common = { viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 1.75, className };
  switch (type) {
    case 'personal':
      return (
        <svg {...common}>
          <circle cx="12" cy="8" r="3.5" strokeLinecap="round" strokeLinejoin="round" />
          <path strokeLinecap="round" strokeLinejoin="round" d="M5 20c0-3.5 3.13-6 7-6s7 2.5 7 6" />
        </svg>
      );
    case 'family':
      return (
        <svg {...common}>
          <circle cx="8.5" cy="8" r="2.75" strokeLinecap="round" strokeLinejoin="round" />
          <circle cx="15.5" cy="8" r="2.75" strokeLinecap="round" strokeLinejoin="round" />
          <path strokeLinecap="round" strokeLinejoin="round" d="M3 19c0-2.8 2.46-4.75 5.5-4.75S14 16.2 14 19M12.5 14.4c.8-.7 1.87-1.15 3-1.15 3.04 0 5.5 1.95 5.5 4.75" />
        </svg>
      );
    case 'business':
      return (
        <svg {...common}>
          <rect x="3" y="8" width="18" height="12" rx="1.5" strokeLinecap="round" strokeLinejoin="round" />
          <path strokeLinecap="round" strokeLinejoin="round" d="M8 8V6a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2M3 13h18" />
        </svg>
      );
    case 'project':
      return (
        <svg {...common}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M5 3v18" />
          <path strokeLinecap="round" strokeLinejoin="round" d="M5 4h11l-2.2 3.5L16 11H5" />
        </svg>
      );
  }
}

interface SpaceSwitcherProps {
  spaces: SpaceSummary[];
  activeSpaceId: string | null;
}

export function SpaceSwitcher({ spaces, activeSpaceId }: SpaceSwitcherProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const activeSpace = spaces.find((s) => s.id === activeSpaceId) ?? spaces[0] ?? null;

  useEffect(() => {
    if (!open) return;
    function handleClickOutside(event: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [open]);

  function handleSelect(spaceId: string) {
    setOpen(false);
    if (spaceId === activeSpace?.id) return;
    startTransition(async () => {
      await setActiveSpace(spaceId);
      router.refresh();
    });
  }

  return (
    <div className="flex items-center gap-2">
      <div ref={containerRef} className="relative">
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          disabled={isPending || spaces.length === 0}
          aria-haspopup="listbox"
          aria-expanded={open}
          className="flex items-center gap-2 rounded-lg border border-white/10 bg-elevated px-3 py-2 text-sm text-stone-100 transition hover:border-gold/30 focus:border-emerald-600 focus:outline-none focus:ring-1 focus:ring-emerald-600 disabled:opacity-50"
        >
          {activeSpace ? (
            <>
              <SpaceTypeIcon type={activeSpace.type} className="h-4 w-4 shrink-0 text-gold" />
              <span className="max-w-[10rem] truncate">
                {activeSpace.name} <span className="text-stone-500">· {SPACE_TYPE_LABEL[activeSpace.type]}</span>
              </span>
            </>
          ) : (
            <span className="text-stone-500">Sin espacios</span>
          )}
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75} className="h-3.5 w-3.5 shrink-0 text-stone-500">
            <path strokeLinecap="round" strokeLinejoin="round" d="m6 9 6 6 6-6" />
          </svg>
        </button>

        {open && (
          <div
            role="listbox"
            className="absolute left-0 top-[calc(100%+6px)] z-30 min-w-[14rem] overflow-hidden rounded-xl border border-white/10 bg-elevated shadow-2xl shadow-black/50"
          >
            {spaces.map((space) => (
              <button
                key={space.id}
                type="button"
                role="option"
                aria-selected={space.id === activeSpace?.id}
                onClick={() => handleSelect(space.id)}
                className={cn(
                  'flex w-full items-center gap-2.5 px-3.5 py-2.5 text-left text-sm transition',
                  space.id === activeSpace?.id ? 'bg-gold/10 text-gold' : 'text-stone-200 hover:bg-white/5',
                )}
              >
                <SpaceTypeIcon
                  type={space.type}
                  className={cn('h-4 w-4 shrink-0', space.id === activeSpace?.id ? 'text-gold' : 'text-stone-500')}
                />
                <span className="min-w-0 flex-1 truncate">{space.name}</span>
                <span className="shrink-0 text-[11px] text-stone-500">{SPACE_TYPE_LABEL[space.type]}</span>
              </button>
            ))}
          </div>
        )}
      </div>

      <CreateSpaceDialog />
    </div>
  );
}
