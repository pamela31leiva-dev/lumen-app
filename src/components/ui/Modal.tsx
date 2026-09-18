'use client';

import { useEffect, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { AnimatePresence, motion } from 'framer-motion';
import { MODAL_PANEL_VARIANTS, OVERLAY_VARIANTS } from '@/lib/motion';
import { cn } from '@/lib/utils';

interface ModalProps {
  open: boolean;
  onClose: () => void;
  children: ReactNode;
  /** Ancho/padding del panel -- cada dialogo trae el suyo (ej. "max-w-sm p-6"). */
  className?: string;
  labelledBy?: string;
  /** true cuando el contenido ya trae su propia tarjeta (ej. ImpactSummaryCard, pensada para captura de pantalla) -- omite el borde/fondo/sombra por defecto del panel. */
  unstyled?: boolean;
}

/**
 * Primitiva unica de modal para toda la app: antes cada dialogo (Crear
 * espacio, Exportar, Importar, Borrar cuenta...) repetia su propio
 * `{open && <div className="fixed inset-0 z-50 bg-black/60 ...">}` con un
 * corte seco de aparicion/desaparicion. Ahora todos comparten un solo
 * componente con fisica real (resorte, ver lib/motion.ts) para el panel y
 * un fade simple para el velo -- un cambio de "sensacion" aqui se propaga a
 * cada modal de la app sin tocarlos uno por uno.
 *
 * Via portal a document.body por el mismo motivo que SpaceSwitcher: ningun
 * overflow-hidden de un ancestro puede recortarlo, y el z-index queda
 * siempre por encima de cualquier otra cosa.
 *
 * Cierre: click en el velo o Escape -- gestos ya esperados en cualquier
 * dialogo, no hace falta un boton de cerrar explicito ademas del propio
 * "Cancelar" de cada formulario.
 */
export function Modal({ open, onClose, children, className, labelledBy, unstyled }: ModalProps) {
  const [mounted, setMounted] = useState(false);

  useEffect(() => setMounted(true), []);

  useEffect(() => {
    if (!open) return;
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') onClose();
    }
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [open, onClose]);

  if (!mounted) return null;

  return createPortal(
    <AnimatePresence>
      {open && (
        <motion.div
          role="dialog"
          aria-modal="true"
          aria-labelledby={labelledBy}
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm"
          variants={OVERLAY_VARIANTS}
          initial="hidden"
          animate="visible"
          exit="exit"
          onClick={(event) => {
            if (event.target === event.currentTarget) onClose();
          }}
        >
          <motion.div
            className={cn('w-full', !unstyled && 'rounded-2xl border border-white/10 bg-elevated shadow-2xl shadow-black/40', className)}
            variants={MODAL_PANEL_VARIANTS}
            initial="hidden"
            animate="visible"
            exit="exit"
            onClick={(event) => event.stopPropagation()}
          >
            {children}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>,
    document.body,
  );
}
