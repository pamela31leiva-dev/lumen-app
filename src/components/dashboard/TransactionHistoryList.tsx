'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { deleteTransaction } from '@/actions/confirm';
import type { TransactionHistoryItem } from '@/domain/types/dashboard';
import { cn } from '@/lib/utils';

const TYPE_LABEL: Record<TransactionHistoryItem['type'], string> = {
  income: 'Ingreso',
  expense: 'Gasto',
  transfer: 'Transferencia',
};

interface TransactionHistoryListProps {
  spaceId: string;
  items: TransactionHistoryItem[];
  canDelete: boolean;
}

/**
 * Bandeja de consulta y borrado puntual de movimientos ya confirmados
 * (ultimos 50). Vive en /settings, no en el tablero principal — es
 * informacion de repaso, no una decision del dia (Cero Ruido).
 */
export function TransactionHistoryList({ spaceId, items, canDelete }: TransactionHistoryListProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [confirmingId, setConfirmingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  function handleDelete(id: string) {
    setError(null);
    startTransition(async () => {
      const result = await deleteTransaction(id, spaceId);
      if (!result.success) {
        setError(result.error);
        setConfirmingId(null);
        return;
      }
      setConfirmingId(null);
      router.refresh();
    });
  }

  if (items.length === 0) {
    return <p className="py-3 text-sm text-stone-500">Todavia no hay movimientos confirmados en este espacio.</p>;
  }

  return (
    <div>
      {error && <p className="mb-2 text-xs text-red-400">{error}</p>}
      <ul className="flex flex-col divide-y divide-white/10">
        {items.map((item) => (
          <li key={item.id} className="flex items-center justify-between gap-3 py-3">
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
            <div className="flex shrink-0 items-center gap-3">
              <span className="amount text-sm text-stone-300">
                {item.amountOriginal.toLocaleString('es-CO')} {item.currencyOriginal}
              </span>
              {canDelete &&
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
