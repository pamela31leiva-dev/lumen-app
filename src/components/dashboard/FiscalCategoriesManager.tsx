'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { applyStandardFiscalTags, deleteCategoryFiscalTag, setCategoryFiscalTag, type CategoryFiscalTagSummary } from '@/actions/fiscal';
import { CustomSelect } from '@/components/ui/CustomSelect';
import { LumenGuideTip } from '@/components/guide/LumenGuideTip';
import { GUIDE_MESSAGES } from '@/domain/guide/messages';
import {
  EXPENSE_TAX_TREATMENTS,
  INCOME_TAX_TREATMENTS,
  TAX_TREATMENT_DESCRIPTION,
  TAX_TREATMENT_LABEL,
  suggestTaxTreatment,
  type TaxTreatment,
} from '@/domain/types/fiscal';
import type { CategoryOption, SpaceType } from '@/domain/types/dashboard';

interface FiscalCategoriesManagerProps {
  spaceId: string;
  spaceType: SpaceType;
  categories: CategoryOption[];
  tags: CategoryFiscalTagSummary[];
  /** RBAC (Bloque P4/P5): owner/admin/editor -- asignar o cambiar una clasificacion. */
  canEdit: boolean;
  /** RBAC: owner/admin -- quitar una clasificacion (volver a "sin clasificar"). */
  canManage: boolean;
}

const NONE_VALUE = '__none__';
const ALL_TREATMENTS: TaxTreatment[] = ['gravado', 'exento', 'no_gravado', 'deducible', 'no_deducible'];

/**
 * Clasificacion Tributaria por Categoria (Bloque P5, con asistente del
 * Bloque P8): la persona le dice a Lumen que una categoria es "gravado" o
 * "deducible" -- Lumen nunca lo adivina ni lo calcula, pero SI sugiere un
 * punto de partida razonable (ver suggestTaxTreatment) para quien no sabe
 * que significan estos terminos. Cada categoria (global o propia del
 * espacio) puede tener una clasificacion distinta por espacio (ver
 * category_fiscal_tags, 0030).
 */
export function FiscalCategoriesManager({ spaceId, spaceType, categories, tags, canEdit, canManage }: FiscalCategoriesManagerProps) {
  const router = useRouter();
  const [pendingCategoryId, setPendingCategoryId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const [isApplyingStandard, setIsApplyingStandard] = useState(false);
  const [standardAppliedMessage, setStandardAppliedMessage] = useState<string | null>(null);

  const tagByCategory = new Map(tags.map((t) => [t.categoryId, t]));
  const incomeCategories = categories.filter((c) => c.kind === 'income');
  const expenseCategories = categories.filter((c) => c.kind === 'expense');
  const unclassifiedCount = categories.filter((c) => !tagByCategory.has(c.id)).length;

  function handleChange(categoryId: string, value: string) {
    setError(null);
    setStandardAppliedMessage(null);
    setPendingCategoryId(categoryId);
    startTransition(async () => {
      try {
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
      } catch (err) {
        console.error('Error de red al cambiar la clasificacion fiscal:', err);
        setPendingCategoryId(null);
        setError('Se perdio la conexion antes de guardar. Intenta de nuevo.');
      }
    });
  }

  function handleApplyStandard() {
    setError(null);
    setStandardAppliedMessage(null);
    setIsApplyingStandard(true);
    applyStandardFiscalTags(spaceId)
      .then((result) => {
        setIsApplyingStandard(false);
        if (!result.success) {
          setError(result.error);
          return;
        }
        setStandardAppliedMessage(
          result.appliedCount === 0
            ? 'Ya todas tus categorias estaban clasificadas -- nada que aplicar.'
            : `Se clasificaron ${result.appliedCount} categoria${result.appliedCount === 1 ? '' : 's'} sin tocar las que ya habias elegido tu.`,
        );
        router.refresh();
      })
      .catch((err) => {
        console.error('Error de red al aplicar las sugerencias estandar:', err);
        setIsApplyingStandard(false);
        setError('Se perdio la conexion antes de aplicar las sugerencias. Intenta de nuevo.');
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
    const suggestion = suggestTaxTreatment(category.kind, spaceType);

    return (
      <div key={category.id} className="flex flex-col gap-1.5 rounded-lg border border-white/10 bg-page px-4 py-2.5 sm:flex-row sm:items-center sm:justify-between sm:gap-3">
        <span className="min-w-0 truncate text-sm text-stone-200">{category.name}</span>
        <div className="flex shrink-0 items-center gap-2 sm:w-auto">
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
          {!tag && canEdit && (
            <button
              type="button"
              disabled={disabled}
              onClick={() => handleChange(category.id, suggestion)}
              className="shrink-0 whitespace-nowrap text-[11px] text-stone-500 underline decoration-white/20 underline-offset-2 hover:text-gold disabled:opacity-50"
            >
              Usar sugerido: {TAX_TREATMENT_LABEL[suggestion]}
            </button>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      {/* Lumen Guide (Fase 1): la clasificacion tributaria es, de lejos, la
          pantalla donde mas se necesita un acompañamiento que baje la
          guardia de "esto es cosa de contadores" antes de siquiera leer el glosario. */}
      <LumenGuideTip {...GUIDE_MESSAGES.fiscalGlossaryIntro} />

      {/* Glosario en lenguaje humano -- "gravado" o "deducible" no dicen nada
          por si solos a quien no es contador. Siempre visible (no un tooltip
          escondido detras de un hover, que en movil ni siquiera existe). */}
      <div className="rounded-lg border border-white/10 bg-page/60 p-3">
        <p className="mb-2 text-xs font-medium text-stone-300">¿Que significa cada termino?</p>
        <dl className="grid grid-cols-1 gap-x-4 gap-y-2 sm:grid-cols-2">
          {ALL_TREATMENTS.map((t) => (
            <div key={t}>
              <dt className="text-xs font-medium text-gold">{TAX_TREATMENT_LABEL[t]}</dt>
              <dd className="text-[11px] leading-snug text-stone-500">{TAX_TREATMENT_DESCRIPTION[t]}</dd>
            </div>
          ))}
        </dl>
      </div>

      {canEdit && unclassifiedCount > 0 && (
        <div className="flex flex-wrap items-center gap-3 rounded-lg border border-gold/20 bg-gold/5 px-4 py-3">
          <p className="flex-1 text-xs text-stone-300">
            Tienes {unclassifiedCount} categoria{unclassifiedCount === 1 ? '' : 's'} sin clasificar. Puedes elegir cada una a mano, o partir de un
            criterio estandar razonable ({spaceType === 'business' ? 'gastos como deducibles' : 'gastos como no deducibles'}, ingresos como
            gravados) y ajustar despues lo que sepas distinto.
          </p>
          <button
            type="button"
            disabled={isApplyingStandard}
            onClick={handleApplyStandard}
            className="shrink-0 rounded-lg bg-wealth px-3.5 py-2 text-xs font-medium text-white transition hover:bg-wealth-hover disabled:cursor-not-allowed disabled:opacity-50"
          >
            {isApplyingStandard ? 'Aplicando...' : 'Aplicar sugerencias estandar'}
          </button>
        </div>
      )}

      {standardAppliedMessage && <p className="text-xs text-growth">{standardAppliedMessage}</p>}
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
