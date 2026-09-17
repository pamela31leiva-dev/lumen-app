'use client';

import { useEffect, useRef, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { setActiveSpace } from '@/actions/dashboard';
import { CreateSpaceDialog } from '@/components/dashboard/CreateSpaceDialog';
import { SPACE_TYPE_LABEL, SpaceTypeIcon } from '@/components/dashboard/space-type-icon';
import type { SpaceSummary } from '@/domain/types/dashboard';
import { cn } from '@/lib/utils';

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
          className={cn(
            'flex items-center gap-2 rounded-xl border border-white/10 bg-elevated px-3 py-2 text-sm text-stone-100 transition hover:border-gold/30 focus:border-emerald-600 focus:outline-none focus:ring-1 focus:ring-emerald-600 disabled:opacity-50',
            open && 'border-gold/40',
          )}
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
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth={1.75}
            className={cn('h-3.5 w-3.5 shrink-0 text-stone-500 transition-transform', open && 'rotate-180')}
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="m6 9 6 6 6-6" />
          </svg>
        </button>

        {/*
          Menu flotante sin altura maxima ni scroll interno a proposito: con
          pocos espacios (el caso comun) un recuadro con scrollbar se siente
          torpe y anticuado. Si crece mucho el numero de espacios, el panel
          simplemente crece con el contenido -- el scroll de la PAGINA (no uno
          interno) es lo que lo hace visible, igual que cualquier otro
          contenido largo. max-w usa min() para nunca desbordar el viewport en
          movil sin importar que tan largo sea el nombre de un espacio.
        */}
        {open && (
          <div
            role="listbox"
            className="animate-fade-scale-in absolute right-0 z-50 mt-2 min-w-[16rem] max-w-[min(22rem,calc(100vw-2rem))] overflow-hidden rounded-2xl border border-white/10 bg-elevated/95 shadow-2xl shadow-black/60 backdrop-blur-xl ring-1 ring-white/5"
          >
            <p className="border-b border-white/5 px-4 pb-2 pt-3 text-[10px] font-medium uppercase tracking-[0.14em] text-stone-500">
              Tus espacios
            </p>
            <div className="p-1.5">
              {spaces.map((space) => {
                const isActive = space.id === activeSpace?.id;
                return (
                  <button
                    key={space.id}
                    type="button"
                    role="option"
                    aria-selected={isActive}
                    onClick={() => handleSelect(space.id)}
                    className={cn(
                      'flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm transition',
                      isActive ? 'bg-gold/10 text-gold' : 'text-stone-200 hover:bg-white/5',
                    )}
                  >
                    <span
                      className={cn(
                        'flex h-8 w-8 shrink-0 items-center justify-center rounded-lg',
                        isActive ? 'bg-gold/15' : 'bg-white/5',
                      )}
                    >
                      <SpaceTypeIcon type={space.type} className={cn('h-4 w-4', isActive ? 'text-gold' : 'text-stone-400')} />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate">{space.name}</span>
                      <span className="block truncate text-[11px] text-stone-500">{SPACE_TYPE_LABEL[space.type]}</span>
                    </span>
                    {isActive && (
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="h-4 w-4 shrink-0 text-gold">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                      </svg>
                    )}
                  </button>
                );
              })}
            </div>
          </div>
        )}
      </div>

      <CreateSpaceDialog />
    </div>
  );
}
