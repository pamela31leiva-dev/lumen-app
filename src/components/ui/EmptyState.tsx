'use client';

interface EmptyStateProps {
  title: string;
  description: string;
  actionLabel: string;
  onAction: () => void;
}

/**
 * Reemplaza el patron "Sin X todavia" (un <p> plano) en toda seccion de
 * Ajustes que gestiona una lista: el hueco vacio es el mejor momento para
 * invitar a crear el primer registro, no solo para confirmar que esta vacio.
 * onAction siempre abre el formulario que ya existia en el componente (nunca
 * duplica la logica de creacion) -- este componente es puramente de
 * presentacion.
 */
export function EmptyState({ title, description, actionLabel, onAction }: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center gap-2 rounded-xl border border-dashed border-white/15 bg-obsidian/60 px-4 py-6 text-center">
      <p className="text-sm font-medium text-stone-300">{title}</p>
      <p className="max-w-xs text-xs text-stone-500">{description}</p>
      <button
        type="button"
        onClick={onAction}
        className="mt-1.5 rounded-lg bg-wealth px-3.5 py-1.5 text-xs font-medium text-white transition hover:bg-wealth-hover"
      >
        {actionLabel}
      </button>
    </div>
  );
}
