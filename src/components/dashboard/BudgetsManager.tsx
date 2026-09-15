'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { deleteBudget, setBudget, type BudgetSummary } from '@/actions/budgets';
import { CustomSelect } from '@/components/ui/CustomSelect';
import { formatMoney } from '@/lib/utils';
import type { CategoryOption } from '@/domain/types/dashboard';

interface BudgetsManagerProps {
  spaceId: string;
  budgets: BudgetSummary[];
  categories: CategoryOption[];
  baseCurrency: string;
  /** RBAC (Bloque P4): owner/admin/editor -- crear (mismo umbral que budgets_insert_editor). */
  canEdit: boolean;
  /** RBAC (Bloque P4): owner/admin -- eliminar (budgets_delete_admin). */
  canManage: boolean;
}

/**
 * Presupuestos (Bloque P3): un monto mensual fijo por categoria de gasto,
 * usado por get_monthly_report para calcular cumplimiento -- sin sobres ni
 * arrastre entre meses, el numero simplemente se compara contra el gasto
 * real de cada mes.
 */
export function BudgetsManager({ spaceId, budgets, categories, baseCurrency, canEdit, canManage }: BudgetsManagerProps) {
  const router = useRouter();
  const [showForm, setShowForm] = useState(false);
  const [categoryId, setCategoryId] = useState('');
  const [amount, setAmount] = useState('');
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const expenseCategories = categories.filter((c) => c.kind === 'expense');
  const budgetedCategoryIds = new Set(budgets.map((b) => b.categoryId));

  function handleCreate() {
    setError(null);
    const parsed = Number(amount);
    if (!categoryId) {
      setError('Elige una categoria.');
      return;
    }
    if (!Number.isFinite(parsed) || parsed <= 0) {
      setError('Escribe un monto mayor que cero.');
      return;
    }

    startTransition(async () => {
      const result = await setBudget(spaceId, categoryId, parsed);
      if (!result.success) {
        setError(result.error);
        return;
      }
      setShowForm(false);
      setCategoryId('');
      setAmount('');
      router.refresh();
    });
  }

  function handleDelete(budgetId: string) {
    setError(null);
    setDeletingId(budgetId);
    deleteBudget(spaceId, budgetId).then((result) => {
      setDeletingId(null);
      if (!result.success) {
        setError(result.error);
        return;
      }
      router.refresh();
    });
  }

  return (
    <div className="flex flex-col gap-3">
      {budgets.length === 0 && !showForm && <p className="text-xs text-stone-500">Sin presupuestos todavia.</p>}

      {budgets.map((budget) => (
        <div key={budget.id} className="flex items-center justify-between gap-3 rounded-lg border border-white/10 bg-obsidian px-4 py-2.5">
          <span className="text-sm text-stone-200">{budget.categoryName}</span>
          <div className="flex shrink-0 items-center gap-3">
            <span className="amount text-sm text-stone-300">{formatMoney(budget.monthlyAmount, baseCurrency)}/mes</span>
            {canManage && (
              <button
                type="button"
                disabled={deletingId === budget.id}
                onClick={() => handleDelete(budget.id)}
                className="text-xs text-red-400 hover:text-red-300 disabled:opacity-50"
              >
                {deletingId === budget.id ? 'Eliminando...' : 'Eliminar'}
              </button>
            )}
          </div>
        </div>
      ))}

      {error && <p className="text-xs text-red-400">{error}</p>}

      {canEdit &&
        (showForm ? (
          <div className="flex flex-col gap-3 rounded-lg border border-white/10 bg-obsidian p-4 sm:flex-row sm:items-end">
            <div className="flex-1">
              <label className="mb-1 block text-xs font-medium text-stone-300">Categoria</label>
              <CustomSelect
                value={categoryId}
                onChange={setCategoryId}
                placeholder="Elige una categoria"
                options={expenseCategories
                  .filter((c) => !budgetedCategoryIds.has(c.id))
                  .map((c) => ({ value: c.id, label: c.name }))}
              />
            </div>
            <div className="w-full sm:w-40">
              <label className="mb-1 block text-xs font-medium text-stone-300">Monto mensual</label>
              <input
                type="number"
                min={1}
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder="ej. 300000"
                className="w-full rounded-lg border border-white/10 bg-elevated px-3 py-2 text-sm text-stone-100 placeholder:text-stone-600 focus:border-emerald-600 focus:outline-none focus:ring-1 focus:ring-emerald-600"
              />
            </div>
            <div className="flex gap-2">
              <button type="button" onClick={() => setShowForm(false)} className="rounded-lg px-3 py-2 text-xs font-medium text-stone-400 hover:text-stone-200">
                Cancelar
              </button>
              <button
                type="button"
                disabled={isPending}
                onClick={handleCreate}
                className="rounded-lg bg-wealth px-3 py-2 text-xs font-medium text-white transition hover:bg-wealth-hover disabled:cursor-not-allowed disabled:opacity-40"
              >
                {isPending ? 'Guardando...' : 'Guardar'}
              </button>
            </div>
          </div>
        ) : (
          <button type="button" onClick={() => setShowForm(true)} className="self-start text-xs font-medium text-gold hover:underline">
            + Nuevo presupuesto
          </button>
        ))}
    </div>
  );
}
