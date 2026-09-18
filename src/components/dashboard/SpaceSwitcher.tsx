'use client';

import { useEffect, useLayoutEffect, useRef, useState, useTransition } from 'react';
import { createPortal } from 'react-dom';
import { useRouter } from 'next/navigation';
import { AnimatePresence, motion } from 'framer-motion';
import { setActiveSpace } from '@/actions/dashboard';
import { CreateSpaceDialog } from '@/components/dashboard/CreateSpaceDialog';
import { SPACE_TYPE_LABEL, SpaceTypeIcon } from '@/components/dashboard/space-type-icon';
import { FLOATING_PANEL_VARIANTS } from '@/lib/motion';
import type { SpaceSummary } from '@/domain/types/dashboard';
import { cn } from '@/lib/utils';

interface SpaceSwitcherProps {
  spaces: SpaceSummary[];
  activeSpaceId: string | null;
}

interface MenuCoords {
  top: number;
  left: number;
}

/** Separacion vertical entre el boton y el panel, margen minimo respecto al borde del viewport, y ancho estimado (min-w-16rem) para el primer calculo antes de poder medir el panel real. */
const MENU_GAP_PX = 8;
const VIEWPORT_MARGIN_PX = 8;
const ESTIMATED_PANEL_WIDTH_PX = 256;

export function SpaceSwitcher({ spaces, activeSpaceId }: SpaceSwitcherProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [open, setOpen] = useState(false);
  const [coords, setCoords] = useState<MenuCoords | null>(null);
  const [mounted, setMounted] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => setMounted(true), []);

  const activeSpace = spaces.find((s) => s.id === activeSpaceId) ?? spaces[0] ?? null;

  /**
   * Corrige el recorte reportado por el usuario: el panel vivia con
   * `position: absolute` DENTRO del <header> del nav (ver AppNav.tsx), asi
   * que cualquier `overflow` de un ancestro -- el propio header, o un
   * contenedor de scroll mas arriba -- podia recortarlo por abajo sin que
   * el z-index sirviera de nada (z-index nunca escapa el `overflow: hidden`
   * de un padre). La solucion real es sacar el panel de ese arbol del todo:
   * se renderiza via createPortal directo en <body>, con `position: fixed`
   * y coordenadas en pixeles de VIEWPORT -- ningun overflow de ningun
   * ancestro puede recortar algo que ya no es su descendiente en el DOM.
   *
   * Se usa `left` (nunca `right`) a proposito: `getBoundingClientRect()` del
   * boton y el `clientWidth` del documento viven en el mismo sistema de
   * coordenadas (excluye la barra de scroll), mientras que `window.innerWidth`
   * la INCLUYE -- mezclar los dos desalineaba el panel unos 15px (el ancho
   * tipico de una scrollbar) en paginas con scroll vertical.
   */
  function computeCoords(estimatedPanelWidth: number): MenuCoords | null {
    const rect = triggerRef.current?.getBoundingClientRect();
    if (!rect) return null;
    const maxLeft = document.documentElement.clientWidth - estimatedPanelWidth - VIEWPORT_MARGIN_PX;
    return {
      top: rect.bottom + MENU_GAP_PX,
      left: Math.min(Math.max(VIEWPORT_MARGIN_PX, rect.right - estimatedPanelWidth), Math.max(VIEWPORT_MARGIN_PX, maxLeft)),
    };
  }

  function handleToggle() {
    setOpen((wasOpen) => {
      if (wasOpen) return false;
      setCoords(computeCoords(ESTIMATED_PANEL_WIDTH_PX));
      return true;
    });
  }

  // Segundo ajuste (parte 3 del pedido -- "coordenadas correctas"): el
  // primer calculo usa un ancho estimado (min-w-16rem) porque el panel
  // todavia no existe en el DOM para medirlo. En cuanto se monta, este efecto
  // corre ANTES de que el navegador pinte (useLayoutEffect) y recalcula con
  // el ancho real -- la persona nunca ve el salto intermedio.
  useLayoutEffect(() => {
    if (!open || !panelRef.current) return;
    const panelWidth = panelRef.current.getBoundingClientRect().width;
    const corrected = computeCoords(panelWidth);
    if (!corrected) return;
    setCoords((current) => (current && current.left === corrected.left && current.top === corrected.top ? current : corrected));
    // Solo debe recalcular cuando el panel se abre -- no en cada render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  useEffect(() => {
    if (!open) return;

    function handleClickOutside(event: MouseEvent) {
      const target = event.target as Node;
      if (triggerRef.current?.contains(target)) return;
      if (panelRef.current?.contains(target)) return;
      setOpen(false);
    }

    // Reposicionar en vez de dejar el panel "flotando" en el lugar
    // equivocado si la ventana cambia de tamaño; cerrar en scroll es lo mas
    // simple y predecible (evita que un position:fixed se desalinee del
    // boton mientras la pagina se mueve por debajo).
    function handleScroll() {
      setOpen(false);
    }
    function handleResize() {
      setCoords(computeCoords(panelRef.current?.getBoundingClientRect().width ?? ESTIMATED_PANEL_WIDTH_PX));
    }

    document.addEventListener('mousedown', handleClickOutside);
    window.addEventListener('scroll', handleScroll, true);
    window.addEventListener('resize', handleResize);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      window.removeEventListener('scroll', handleScroll, true);
      window.removeEventListener('resize', handleResize);
    };
  }, [open]);

  function handleSelect(spaceId: string) {
    setOpen(false);
    if (spaceId === activeSpace?.id) return;
    startTransition(async () => {
      try {
        await setActiveSpace(spaceId);
        router.refresh();
      } catch (err) {
        // Bajo riesgo (solo cambia una cookie): sin estado de error visible
        // aqui, pero se registra para diagnostico -- si falla, el header
        // simplemente no cambia de espacio, la persona lo nota e intenta de nuevo.
        console.error('Error de red al cambiar de espacio:', err);
      }
    });
  }

  return (
    <div className="flex items-center gap-2">
      <button
        ref={triggerRef}
        type="button"
        onClick={handleToggle}
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
        simplemente crece con el contenido. max-w usa min() para nunca
        desbordar el viewport en movil sin importar que tan largo sea el
        nombre de un espacio.

        Portal + position:fixed + z-[9999] (ver computeCoords arriba): nunca
        se renderiza dentro del <header>, asi que ningun overflow-hidden o
        overflow-y-auto de un ancestro puede recortarlo.
      */}
      {mounted &&
        createPortal(
          <AnimatePresence>
            {open && coords && (
              <motion.div
                ref={panelRef}
                role="listbox"
                style={{ top: coords.top, left: coords.left }}
                className="fixed z-[9999] min-w-[16rem] max-w-[min(22rem,calc(100vw-2rem))] origin-top-right overflow-hidden rounded-2xl border border-white/10 bg-elevated/95 shadow-2xl shadow-black/60 backdrop-blur-xl ring-1 ring-white/5"
                variants={FLOATING_PANEL_VARIANTS}
                initial="hidden"
                animate="visible"
                exit="exit"
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
              </motion.div>
            )}
          </AnimatePresence>,
          document.body,
        )}

      <CreateSpaceDialog />
    </div>
  );
}
