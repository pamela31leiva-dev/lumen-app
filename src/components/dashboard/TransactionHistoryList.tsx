'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { bulkDeleteTransactions, bulkUpdateCategory, deleteTransaction } from '@/actions/confirm';
import { CustomSelect } from '@/components/ui/CustomSelect';
import type { CategoryOption, TransactionHistoryItem } from '@/domain/types/dashboard';
import { cn } from '@/lib/utils';

const TYPE_LABEL: Record<TransactionHistoryItem['type'], string> = {
  income: 'Ingreso',
  expense: 'Gasto',
  transfer: 'Transferencia',
};

interface TransactionHistoryListProps {
  spaceId: string;
  items: TransactionHistoryItem[];
  categories: CategoryOption[];
  canDelete: boolean;
}

/**
 * Bandeja de consulta y borrado puntual de movimientos ya confirmados
 * (ultimos 50). Vive en /settings, no en el tablero principal — es
 * informacion de repaso, no una decision del dia (Cero Ruido).
 *
 * Gestion en lote: activar "Seleccionar" muestra checkboxes; con 1+
 * seleccionados aparece una barra para recategorizar o eliminar todos de una
 * vez -- elimina la friccion de corregir movimiento por movimiento cuando la
 * IA le puso la misma categoria equivocada a varios.
 */
export function TransactionHistoryList({ spaceId, items, categories, canDelete }: TransactionHistoryListProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [confirmingId, setConfirmingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  // Optimista: la fila desaparece de inmediato al confirmar el borrado, sin
  // esperar el round-trip de router.refresh() (que sigue pasando en segundo
  // plano para que la lista real del servidor quede al dia).
  const [removedIds, setRemovedIds] = useState<Set<string>>(new Set());

  const [selectionMode, setSelectionMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkCategoryId, setBulkCategoryId] = useState('');
  const [confirmingBulkDelete, setConfirmingBulkDelete] = useState(false);

  function handleDelete(id: string) {
    setError(null);
    setRemovedIds((prev) => new Set(prev).add(id));
    startTransition(async () => {
      const result = await deleteTransaction(id, spaceId);
      if (!result.success) {
        setError(result.error);
        setRemovedIds((prev) => {
          const next = new Set(prev);
          next.delete(id);
          return next;
        });
        setConfirmingId(null);
        return;
      }
      setConfirmingId(null);
      router.refresh();
    });
  }

  function toggleSelectionMode() {
    setSelectionMode((prev) => !prev);
    setSelectedIds(new Set());
    setError(null);
  }

  function toggleSelected(id: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function handleBulkRecategorize() {
    if (!bulkCategoryId || selectedIds.size === 0) return;
    setError(null);
    const ids = Array.from(selectedIds);
    startTransition(async () => {
      const result = await bulkUpdateCategory(ids, spaceId, bulkCategoryId);
      if (!result.success) {
        setError(result.error);
        return;
      }
      setSelectedIds(new Set());
      setBulkCategoryId('');
      router.refresh();
    });
  }

  function handleBulkDelete() {
    setError(null);
    const ids = Array.from(selectedIds);
    setRemovedIds((prev) => {
      const next = new Set(prev);
      ids.forEach((id) => next.add(id));
      return next;
    });
    startTransition(async () => {
      const result = await bulkDeleteTransactions(ids, spaceId);
      if (!result.success) {
        setError(result.error);
        setRemovedIds((prev) => {
          const next = new Set(prev);
          ids.forEach((id) => next.delete(id));
          return next;
        });
        setConfirmingBulkDelete(false);
        return;
      }
      setSelectedIds(new Set());
      setConfirmingBulkDelete(false);
      router.refresh();
    });
  }

  const visibleItems = items.filter((item) => !removedIds.has(item.id));

  if (visibleItems.length === 0) {
    return <p className="py-3 text-sm text-stone-500">Todavia no hay movimientos confirmados en este espacio.</p>;
  }

  return (
    <div>
      <div className="mb-2 flex items-center justify-between gap-2">
        {error && <p className="text-xs text-red-400">{error}</p>}
        {canDelete && (
          <button
            type="button"
            onClick={toggleSelectionMode}
            className="ml-auto text-xs text-stone-400 underline decoration-white/20 underline-offset-2 hover:text-stone-200"
          >
            {selectionMode ? 'Cancelar seleccion' : 'Seleccionar'}
          </button>
        )}
      </div>

      {selectionMode && selectedIds.size > 0 && (
        <div className="animate-fade-scale-in mb-3 flex flex-wrap items-center gap-2 rounded-lg border border-gold/25 bg-gold-soft p-3">
          <span className="text-xs text-stone-200">{selectedIds.size} seleccionados</span>
          <div className="min-w-[10rem]">
            <CustomSelect
              value={bulkCategoryId}
              onChange={setBulkCategoryId}
              placeholder="Cambiar categoria a..."
              options={categories.map((c) => ({ value: c.id, label: c.name }))}
            />
          </div>
          <button
            type="button"
            onClick={handleBulkRecategorize}
            disabled={!bulkCategoryId || isPending}
            className="rounded-lg bg-wealth px-3 py-1.5 text-xs font-medium text-white transition hover:bg-wealth-hover disabled:opacity-50"
          >
            Aplicar
          </button>
          <div className="ml-auto">
            {confirmingBulkDelete ? (
              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={handleBulkDelete}
                  disabled={isPending}
                  className="rounded-md bg-red-500/15 px-2 py-1 text-xs font-medium text-red-400 hover:bg-red-500/25 disabled:opacity-50"
                >
                  Confirmar
                </button>
                <button
                  type="button"
                  onClick={() => setConfirmingBulkDelete(false)}
                  className="rounded-md px-2 py-1 text-xs text-stone-400 hover:text-stone-200"
                >
                  Cancelar
                </button>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => setConfirmingBulkDelete(true)}
                className="rounded-lg px-3 py-1.5 text-xs text-stone-400 hover:text-red-400"
              >
                Eliminar todos
              </button>
            )}
          </div>
        </div>
      )}

      <ul className="flex flex-col divide-y divide-white/10">
        {visibleItems.map((item) => (
          <li key={item.id} className="animate-fade-scale-in flex items-center justify-between gap-3 py-3">
            <div className="flex min-w-0 items-center gap-3">
              {selectionMode && (
                <input
                  type="checkbox"
                  checked={selectedIds.has(item.id)}
                  onChange={() => toggleSelected(item.id)}
                  className="h-4 w-4 shrink-0 rounded border-white/20 bg-obsidian accent-emerald-600"
                />
              )}
              <div className="min-w-0">
                <p className="truncate text-sm text-stone-100">{item.description ?? TYPE_LABEL[item.type]}</p>
                <p className="text-xs text-stone-500">
                  {new Date(item.transactionDate).toLocaleDateString('es-CO')} · {item.categoryName ?? TYPE_LABEL[item.type]}
                </p>
                {item.tags.length > 0 && (
                  <div className="mt-1 flex flex-wrap gap-1">
                    {item.tags.map((tag) => (
                      <span key={tag} className="rounded-full bg-white/5 px-2 py-0.5 text-[10px] text-stone-400">
                        {tag}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            </div>
            <div className="flex shrink-0 items-center gap-3">
              <span className="amount text-sm text-stone-300">
                {item.amountOriginal.toLocaleString('es-CO')} {item.currencyOriginal}
              </span>
              {canDelete &&
                !selectionMode &&
                (confirmingId === item.id ? (
                  <div className="flex items-center gap-1.5">
                    <button
                      type="button"
                      onClick={() => handleDelete(item.id)}
                      disabled={isPending}
                      className="rounded-md bg-red-500/15 px-2 py-1 text-xs font-medium text-red-400 hover:bg-red-500/25 disabled:opacity-50"
                    >
                      {isPending ? '...' : 'Confirmar'}
                    </button>
                    <button
                      type="button"
                      onClick={() => setConfirmingId(null)}
                      disabled={isPending}
                      className="rounded-md px-2 py-1 text-xs text-stone-400 hover:text-stone-200"
                    >
                      Cancelar
                    </button>
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={() => setConfirmingId(item.id)}
                    title="Eliminar movimiento"
                    aria-label="Eliminar movimiento"
                    className={cn('rounded-md p-1.5 text-stone-500 transition hover:bg-red-500/10 hover:text-red-400')}
                  >
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75} className="h-4 w-4">
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        d="M4 7h16M9 7V5a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2m-8 0 1 12a1 1 0 0 0 1 1h6a1 1 0 0 0 1-1l1-12"
                      />
                    </svg>
                  </button>
                ))}
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
