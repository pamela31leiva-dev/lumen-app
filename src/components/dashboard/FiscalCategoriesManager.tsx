'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { deleteCategoryFiscalTag, setCategoryFiscalTag, type CategoryFiscalTagSummary } from '@/actions/fiscal';
import { CustomSelect } from '@/components/ui/CustomSelect';
import { EXPENSE_TAX_TREATMENTS, INCOME_TAX_TREATMENTS, TAX_TREATMENT_LABEL, type TaxTreatment } from '@/domain/types/fiscal';
import type { CategoryOption } from '@/domain/types/dashboard';

interface FiscalCategoriesManagerProps {
  spaceId: string;
  categories: CategoryOption[];
  tags: CategoryFiscalTagSummary[];
  /** RBAC (Bloque P4/P5): owner/admin/editor -- asignar o cambiar una clasificacion. */
  canEdit: boolean;
  /** RBAC: owner/admin -- quitar una clasificacion (volver a "sin clasificar"). */
  canManage: boolean;
}

const NONE_VALUE = '__none__';

/**
 * Clasificacion Tributaria por Categoria (Bloque P5): la persona le dice a
 * Lumen que una categoria es "gravado" o "deducible" -- Lumen nunca lo
 * adivina ni lo calcula. Cada categoria (global o propia del espacio) puede
 * tener una clasificacion distinta por espacio (ver category_fiscal_tags,
 * 0030): una tarjeta de credito de Negocio y una Personal pueden clasificar
 * "Salud" de forma distinta sin pisarse.
 */
export function FiscalCategoriesManager({ spaceId, categories, tags, canEdit, canManage }: FiscalCategoriesManagerProps) {
  const router = useRouter();
  const [pendingCategoryId, setPendingCategoryId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const tagByCategory = new Map(tags.map((t) => [t.categoryId, t]));
  const incomeCategories = categories.filter((c) => c.kind === 'income');
  const expenseCategories = categories.filter((c) => c.kind === 'expense');

  function handleChange(categoryId: string, value: string) {
    setError(null);
    setPendingCategoryId(categoryId);
    startTransition(async () => {
      const existingTag = tagByCategory.get(categoryId);
      const result =
        value === NONE_VALUE
          ? existingTag
            ? await deleteCategoryFiscalTag(spaceId, existingTag.id)
            : { success: true as const }
          : await setCategoryFiscalTag(spaceId, categoryId, value as TaxTreatment);

      setPendingCategoryId(null);
      if (!result.success) {
        setError(result.error);
        return;
      }
      router.refresh();
    });
  }

  function optionsFor(treatments: TaxTreatment[], categoryId: string) {
    const hasTag = tagByCategory.has(categoryId);
    const base = treatments.map((t) => ({ value: t, label: TAX_TREATMENT_LABEL[t] }));
    // "Sin clasificar" solo se ofrece si YA hay una etiqueta que quitar (y
    // solo si se puede administrar) -- si nunca se ha clasificado, no hace
    // falta un valor "ninguno" que en la practica es el estado por defecto.
    return hasTag && canManage ? [{ value: NONE_VALUE, label: 'Sin clasificar' }, ...base] : base;
  }

  function renderRow(category: CategoryOption, treatments: TaxTreatment[]) {
    const tag = tagByCategory.get(category.id);
    const value = tag?.taxTreatment ?? '';
    const disabled = isPending && pendingCategoryId === category.id;

    return (
      <div key={category.id} className="flex items-center justify-between gap-3 rounded-lg border border-white/10 bg-obsidian px-4 py-2.5">
        <span className="min-w-0 truncate text-sm text-stone-200">{category.name}</span>
        <div className="w-40 shrink-0">
          {canEdit ? (
            <CustomSelect
              value={value}
              onChange={(v) => handleChange(category.id, v)}
              placeholder="Sin clasificar"
              disabled={disabled}
              options={optionsFor(treatments, category.id)}
            />
          ) : (
            <span className="text-xs text-stone-500">{tag ? TAX_TREATMENT_LABEL[tag.taxTreatment] : 'Sin clasificar'}</span>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      {error && <p className="text-xs text-red-400">{error}</p>}

      <div>
        <p className="mb-2 text-xs font-medium uppercase tracking-wide text-stone-500">Ingresos</p>
        <div className="flex flex-col gap-2">
          {incomeCategories.length === 0 ? (
            <p className="text-xs text-stone-600">Sin categorias de ingreso.</p>
          ) : (
            incomeCategories.map((c) => renderRow(c, INCOME_TAX_TREATMENTS))
          )}
        </div>
      </div>

      <div>
        <p className="mb-2 text-xs font-medium uppercase tracking-wide text-stone-500">Gastos</p>
        <div className="flex flex-col gap-2">
          {expenseCategories.length === 0 ? (
            <p className="text-xs text-stone-600">Sin categorias de gasto.</p>
          ) : (
            expenseCategories.map((c) => renderRow(c, EXPENSE_TAX_TREATMENTS))
          )}
        </div>
      </div>
    </div>
  );
}
