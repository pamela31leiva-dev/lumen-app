'use client';

import { useEffect, useRef, useState, type ReactNode } from 'react';
import { cn } from '@/lib/utils';

export interface CustomSelectOption {
  value: string;
  label: string;
  icon?: ReactNode;
  /** Texto corto secundario a la derecha (ej. moneda de la cuenta, tipo de categoria). */
  hint?: string;
}

interface CustomSelectProps {
  value: string;
  onChange: (value: string) => void;
  options: CustomSelectOption[];
  placeholder?: string;
  disabled?: boolean;
  id?: string;
  emptyLabel?: string;
}

/**
 * Reemplazo generico de <select> con el tema oscuro de Lumen: en movil, un
 * <select> nativo abre el picker blanco del sistema operativo, que desentona
 * por completo con la interfaz. Un solo componente para Tipo/Cuenta/
 * Categoria/Tipo de espacio/mapeo de columnas — mismo patron que
 * SpaceSwitcher (boton + panel flotante, cierre al hacer click afuera).
 */
export function CustomSelect({ value, onChange, options, placeholder = 'Selecciona...', disabled, id, emptyLabel = 'Sin opciones' }: CustomSelectProps) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const selected = options.find((o) => o.value === value);

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

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        id={id}
        onClick={() => setOpen((v) => !v)}
        disabled={disabled}
        aria-haspopup="listbox"
        aria-expanded={open}
        className="flex w-full items-center justify-between gap-2 rounded-lg border border-white/10 bg-obsidian px-3 py-2 text-sm text-stone-100 transition hover:border-white/20 focus:border-emerald-600 focus:outline-none focus:ring-1 focus:ring-emerald-600 disabled:opacity-50"
      >
        <span className={cn('flex min-w-0 flex-1 items-center gap-2 truncate text-left', !selected && 'text-stone-600')}>
          {selected?.icon}
          <span className="truncate">{selected ? selected.label : placeholder}</span>
        </span>
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75} className="h-3.5 w-3.5 shrink-0 text-stone-500">
          <path strokeLinecap="round" strokeLinejoin="round" d="m6 9 6 6 6-6" />
        </svg>
      </button>

      {open && (
        <div
          role="listbox"
          className="animate-fade-scale-in absolute left-0 top-[calc(100%+6px)] z-30 max-h-64 w-full min-w-[10rem] overflow-y-auto rounded-xl border border-white/10 bg-elevated shadow-2xl shadow-black/50"
        >
          {options.length === 0 && <p className="px-3.5 py-2.5 text-sm text-stone-500">{emptyLabel}</p>}
          {options.map((option) => (
            <button
              key={option.value}
              type="button"
              role="option"
              aria-selected={option.value === value}
              onClick={() => {
                onChange(option.value);
                setOpen(false);
              }}
              className={cn(
                'flex w-full items-center gap-2.5 px-3.5 py-2.5 text-left text-sm transition',
                option.value === value ? 'bg-gold/10 text-gold' : 'text-stone-200 hover:bg-white/5',
              )}
            >
              {option.icon}
              <span className="min-w-0 flex-1 truncate">{option.label}</span>
              {option.hint && <span className="shrink-0 text-[11px] text-stone-500">{option.hint}</span>}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
