'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { createMerchantRule, deleteMerchantRule, updateMerchantRule, type MerchantRuleInput, type MerchantRuleSummary } from '@/actions/merchant-rules';
import { CustomSelect } from '@/components/ui/CustomSelect';
import { EmptyState } from '@/components/ui/EmptyState';
import { FOLDER_LABEL, FOLDER_ORDER, type Folder } from '@/domain/folders';
import type { CategoryOption } from '@/domain/types/dashboard';

interface AccountOption {
  accountId: string;
  name: string;
}

interface MerchantRulesManagerProps {
  spaceId: string;
  rules: MerchantRuleSummary[];
  categories: CategoryOption[];
  accounts: AccountOption[];
  /** RBAC (Bloque P4): owner/admin/editor -- crear y editar (mismo umbral que merchant_rules_insert_editor/_update_editor). */
  canEdit: boolean;
  /** RBAC (Bloque P4): owner/admin -- eliminar (merchant_rules_delete_admin). */
  canManage: boolean;
}

const EMPTY_INPUT: MerchantRuleInput = { pattern: '', categoryId: null, accountId: null, tags: [], folder: null };

function RuleForm({
  spaceId,
  initial,
  isActive,
  categories,
  accounts,
  onDone,
  onCancel,
}: {
  spaceId: string;
  initial: MerchantRuleInput & { id?: string };
  isActive: boolean;
  categories: CategoryOption[];
  accounts: AccountOption[];
  onDone: () => void;
  onCancel: () => void;
}) {
  const [pattern, setPattern] = useState(initial.pattern);
  const [categoryId, setCategoryId] = useState(initial.categoryId ?? '');
  const [accountId, setAccountId] = useState(initial.accountId ?? '');
  const [folder, setFolder] = useState(initial.folder ?? '');
  const [tagsInput, setTagsInput] = useState(initial.tags.join(', '));
  const [active, setActive] = useState(isActive);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function handleSubmit() {
    setError(null);
    const input: MerchantRuleInput = {
      pattern,
      categoryId: categoryId || null,
      accountId: accountId || null,
      folder: (folder || null) as Folder | null,
      tags: tagsInput
        .split(',')
        .map((t) => t.trim().toLowerCase())
        .filter(Boolean),
    };

    startTransition(async () => {
      try {
        const result = initial.id
          ? await updateMerchantRule(spaceId, initial.id, { ...input, isActive: active })
          : await createMerchantRule(spaceId, input);
        if (!result.success) {
          setError(result.error);
          return;
        }
        onDone();
      } catch (err) {
        console.error('Error de red al guardar la regla:', err);
        setError('Se perdio la conexion antes de guardar. Intenta de nuevo.');
      }
    });
  }

  return (
    <div className="flex flex-col gap-3 rounded-lg border border-white/10 bg-obsidian p-4">
      <div>
        <label className="mb-1 block text-xs font-medium text-stone-300">Texto a reconocer en la descripcion</label>
        <input
          value={pattern}
          onChange={(e) => setPattern(e.target.value)}
          placeholder="ej. NETFLIX, EPM, UBER"
          className="w-full rounded-lg border border-white/10 bg-elevated px-3 py-2 text-sm text-stone-100 placeholder:text-stone-600 focus:border-emerald-600 focus:outline-none focus:ring-1 focus:ring-emerald-600"
        />
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="mb-1 block text-xs font-medium text-stone-300">Categoria</label>
          <CustomSelect
            value={categoryId}
            onChange={setCategoryId}
            placeholder="Sin categoria"
            options={[{ value: '', label: 'Sin categoria' }, ...categories.map((c) => ({ value: c.id, label: c.name }))]}
          />
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-stone-300">Cuenta</label>
          <CustomSelect
            value={accountId}
            onChange={setAccountId}
            placeholder="Sin cuenta"
            options={[{ value: '', label: 'Sin cuenta' }, ...accounts.map((a) => ({ value: a.accountId, label: a.name }))]}
          />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="mb-1 block text-xs font-medium text-stone-300">Carpeta</label>
          <CustomSelect
            value={folder}
            onChange={setFolder}
            placeholder="No forzar"
            options={[{ value: '', label: 'No forzar' }, ...FOLDER_ORDER.map((f) => ({ value: f, label: FOLDER_LABEL[f] }))]}
          />
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-stone-300">Etiquetas (opcional)</label>
          <input
            value={tagsInput}
            onChange={(e) => setTagsInput(e.target.value)}
            placeholder="ej. suscripciones"
            className="w-full rounded-lg border border-white/10 bg-elevated px-3 py-2 text-sm text-stone-100 placeholder:text-stone-600 focus:border-emerald-600 focus:outline-none focus:ring-1 focus:ring-emerald-600"
          />
        </div>
      </div>

      {initial.id && (
        <label className="flex items-center gap-2 text-xs text-stone-300">
          <input type="checkbox" checked={active} onChange={(e) => setActive(e.target.checked)} className="h-3.5 w-3.5 rounded border-white/20 bg-transparent" />
          Regla activa
        </label>
      )}

      {error && <p className="text-xs text-red-400">{error}</p>}

      <div className="flex justify-end gap-2">
        <button type="button" onClick={onCancel} className="rounded-lg px-3 py-2 text-xs font-medium text-stone-400 hover:text-stone-200">
          Cancelar
        </button>
        <button
          type="button"
          disabled={isPending || !pattern.trim()}
          onClick={handleSubmit}
          className="rounded-lg bg-wealth px-3 py-2 text-xs font-medium text-white transition hover:bg-wealth-hover disabled:cursor-not-allowed disabled:opacity-40"
        >
          {isPending ? 'Guardando...' : initial.id ? 'Guardar cambios' : 'Crear regla'}
        </button>
      </div>
    </div>
  );
}

/**
 * Reglas Inteligentes por Comercio (Bloque P2-2): cada regla se evalua contra
 * la descripcion de toda captura nueva (texto/voz/foto/documento, extracto
 * importado, Bandeja Automatica) -- si coincide, pre-llena categoria/cuenta/
 * etiquetas/carpeta en la transaccion pending_confirmation. Nunca se
 * auto-confirma nada: la persona sigue revisando antes de que cuente para
 * saldos, la regla solo le ahorra corregir lo mismo cada vez.
 */
export function MerchantRulesManager({ spaceId, rules, categories, accounts, canEdit, canManage }: MerchantRulesManagerProps) {
  const router = useRouter();
  const [showAddForm, setShowAddForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  function handleDone() {
    setShowAddForm(false);
    setEditingId(null);
    router.refresh();
  }

  function handleDelete(ruleId: string) {
    setError(null);
    setDeletingId(ruleId);
    deleteMerchantRule(spaceId, ruleId)
      .then((result) => {
        setDeletingId(null);
        if (!result.success) {
          setError(result.error);
          return;
        }
        router.refresh();
      })
      .catch((err) => {
        console.error('Error de red al eliminar la regla:', err);
        setDeletingId(null);
        setError('Se perdio la conexion antes de eliminar. Intenta de nuevo.');
      });
  }

  return (
    <div className="flex flex-col gap-3">
      {rules.length === 0 &&
        !showAddForm &&
        (canEdit ? (
          <EmptyState
            title="Sin reglas todavia"
            description="Crea una para que un comercio recurrente (ej. tu supermercado de siempre) se categorice solo la proxima vez."
            actionLabel="+ Crear la primera"
            onAction={() => setShowAddForm(true)}
          />
        ) : (
          <p className="text-xs text-stone-500">Sin reglas todavia.</p>
        ))}

      {rules.map((rule) =>
        editingId === rule.id ? (
          <RuleForm
            key={rule.id}
            spaceId={spaceId}
            initial={{ id: rule.id, pattern: rule.pattern, categoryId: rule.categoryId, accountId: rule.accountId, tags: rule.tags, folder: rule.folder }}
            isActive={rule.isActive}
            categories={categories}
            accounts={accounts}
            onDone={handleDone}
            onCancel={() => setEditingId(null)}
          />
        ) : (
          <div key={rule.id} className="flex items-center justify-between gap-3 rounded-lg border border-white/10 bg-obsidian px-4 py-2.5">
            <div className="min-w-0">
              <p className="truncate text-sm text-stone-200">
                &quot;{rule.pattern}&quot;
                {!rule.isActive && <span className="ml-2 text-[10px] uppercase tracking-wide text-stone-600">Inactiva</span>}
              </p>
              <p className="mt-0.5 truncate text-xs text-stone-500">
                {[rule.categoryName, rule.accountName, rule.folder ? FOLDER_LABEL[rule.folder] : null, ...rule.tags].filter(Boolean).join(' · ') || 'Sin acciones configuradas'}
              </p>
            </div>
            {(canEdit || canManage) && (
              <div className="flex shrink-0 items-center gap-3">
                {canEdit && (
                  <button type="button" onClick={() => setEditingId(rule.id)} className="text-xs text-stone-400 hover:text-stone-200">
                    Editar
                  </button>
                )}
                {canManage && (
                  <button
                    type="button"
                    disabled={deletingId === rule.id}
                    onClick={() => handleDelete(rule.id)}
                    className="text-xs text-red-400 hover:text-red-300 disabled:opacity-50"
                  >
                    {deletingId === rule.id ? 'Eliminando...' : 'Eliminar'}
                  </button>
                )}
              </div>
            )}
          </div>
        ),
      )}

      {error && <p className="text-xs text-red-400">{error}</p>}

      {canEdit &&
        (showAddForm ? (
          <RuleForm
            spaceId={spaceId}
            initial={EMPTY_INPUT}
            isActive={true}
            categories={categories}
            accounts={accounts}
            onDone={handleDone}
            onCancel={() => setShowAddForm(false)}
          />
        ) : (
          rules.length > 0 && (
            <button type="button" onClick={() => setShowAddForm(true)} className="self-start text-xs font-medium text-gold hover:underline">
              + Nueva regla
            </button>
          )
        ))}
    </div>
  );
}
