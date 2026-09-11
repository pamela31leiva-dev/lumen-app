'use client';

import { useState, useTransition, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { createRecurringIncome, deleteRecurringIncome, toggleRecurringIncomeActive, type RecurringIncomeSummary } from '@/actions/recurring-incomes';
import { CustomSelect } from '@/components/ui/CustomSelect';
import { FOLDER_LABEL, FOLDER_ORDER, type Folder } from '@/domain/folders';
import { cn, formatMoney } from '@/lib/utils';

interface RecurringIncomesCardProps {
  spaceId: string;
  baseCurrency: string;
  recurringIncomes: RecurringIncomeSummary[];
}

const MONTH_LABEL = [
  'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
  'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre',
];
const MONTH_OPTIONS = MONTH_LABEL.map((label, i) => ({ value: String(i + 1), label }));

/**
 * Ingresos Recurrentes con Ajuste Anual (0019): pension, salario u otro flujo
 * fijo se registra UNA vez y el sistema genera su transaccion
 * pending_confirmation cada mes sin volver a teclearla (ver
 * generate_due_recurring_incomes, llamado desde getExecutiveBoardSnapshot en
 * cada carga del tablero). El ajuste anual es opcional -- sin el, el monto
 * se repite igual mes a mes.
 */
export function RecurringIncomesCard({ spaceId, baseCurrency, recurringIncomes }: RecurringIncomesCardProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [busyId, setBusyId] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [description, setDescription] = useState('');
  const [amount, setAmount] = useState('');
  const [folder, setFolder] = useState<Folder>('personal');
  const [adjustmentEnabled, setAdjustmentEnabled] = useState(false);
  const [adjustmentPercent, setAdjustmentPercent] = useState('');
  const [adjustmentMonth, setAdjustmentMonth] = useState('1');
  const [error, setError] = useState<string | null>(null);

  function resetForm() {
    setDescription('');
    setAmount('');
    setFolder('personal');
    setAdjustmentEnabled(false);
    setAdjustmentPercent('');
    setAdjustmentMonth('1');
  }

  function handleCreate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    const parsedAmount = Number(amount);
    if (!description.trim() || !Number.isFinite(parsedAmount) || parsedAmount <= 0) {
      setError('Escribe una descripcion y un monto mayor que cero.');
      return;
    }
    const parsedPercent = adjustmentEnabled ? Number(adjustmentPercent) : null;
    if (adjustmentEnabled && (!Number.isFinite(parsedPercent) || Math.abs(parsedPercent as number) > 100)) {
      setError('El ajuste anual debe ser un numero entre -100 y 100.');
      return;
    }

    startTransition(async () => {
      const result = await createRecurringIncome(
        spaceId,
        description.trim(),
        parsedAmount,
        baseCurrency,
        folder,
        parsedPercent,
        Number(adjustmentMonth),
      );
      if (!result.success) {
        setError(result.error);
        return;
      }
      resetForm();
      setShowForm(false);
      router.refresh();
    });
  }

  function handleToggleActive(income: RecurringIncomeSummary) {
    setBusyId(income.id);
    startTransition(async () => {
      await toggleRecurringIncomeActive(spaceId, income.id, !income.isActive);
      setBusyId(null);
      router.refresh();
    });
  }

  function handleDelete(income: RecurringIncomeSummary) {
    setBusyId(income.id);
    startTransition(async () => {
      await deleteRecurringIncome(spaceId, income.id);
      setBusyId(null);
      router.refresh();
    });
  }

  return (
    <section className="rounded-xl border border-white/10 bg-elevated p-5 transition-colors hover:border-gold/15">
      <div className="flex items-center justify-between gap-2">
        <p className="text-[11px] font-medium uppercase tracking-[0.2em] text-stone-500">Ingresos Fijos</p>
        {!showForm && (
          <button
            type="button"
            onClick={() => setShowForm(true)}
            className="text-xs text-stone-500 underline decoration-white/20 underline-offset-2 hover:text-stone-300"
          >
            + Agregar
          </button>
        )}
      </div>

      {recurringIncomes.length === 0 && !showForm && (
        <p className="mt-2 text-sm text-stone-500">
          Pension, salario u otro ingreso fijo: registralo una vez y Lumen lo proyecta solo, mes a mes.
        </p>
      )}

      {recurringIncomes.length > 0 && (
        <ul className="mt-3 flex flex-col divide-y divide-white/10">
          {recurringIncomes.map((income) => (
            <li key={income.id} className="flex items-center justify-between gap-3 py-2.5">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <p className={cn('truncate text-sm', income.isActive ? 'text-stone-100' : 'text-stone-500 line-through')}>
                    {income.description}
                  </p>
                  <span className="shrink-0 rounded-full bg-white/5 px-2 py-0.5 text-[10px] font-medium text-stone-400">
                    {FOLDER_LABEL[income.folder]}
                  </span>
                  {income.annualAdjustmentPercent !== null && (
                    <span className="shrink-0 rounded-full bg-emerald-600/10 px-2 py-0.5 text-[10px] font-medium text-emerald-400">
                      +{income.annualAdjustmentPercent}%/año en {MONTH_LABEL[income.adjustmentMonth - 1]}
                    </span>
                  )}
                </div>
                <p className="amount mt-0.5 text-xs text-stone-500">
                  {formatMoney(income.amount, income.currency)} / mes
                </p>
              </div>
              <div className="flex shrink-0 items-center gap-3">
                <button
                  type="button"
                  onClick={() => handleToggleActive(income)}
                  disabled={isPending && busyId === income.id}
                  className="text-xs text-stone-500 underline decoration-white/20 underline-offset-2 hover:text-stone-300 disabled:opacity-50"
                >
                  {income.isActive ? 'Pausar' : 'Reactivar'}
                </button>
                <button
                  type="button"
                  onClick={() => handleDelete(income)}
                  disabled={isPending && busyId === income.id}
                  className="text-xs text-stone-600 underline decoration-white/10 underline-offset-2 hover:text-red-400 disabled:opacity-50"
                >
                  Eliminar
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}

      {error && <p className="mt-3 text-xs text-red-400">{error}</p>}

      {showForm && (
        <form onSubmit={handleCreate} className="mt-4 flex flex-col gap-3 rounded-xl border border-white/10 bg-obsidian p-4">
          <div className="flex flex-col gap-2 sm:flex-row">
            <input
              type="text"
              placeholder="Ej. Pension, Salario"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="min-w-0 flex-1 rounded-lg border border-white/10 bg-elevated px-3 py-2 text-sm text-stone-100 placeholder:text-stone-600 focus:border-emerald-600 focus:outline-none focus:ring-1 focus:ring-emerald-600"
            />
            <input
              type="number"
              min="0"
              step="0.01"
              placeholder="Monto mensual"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              className="amount w-full rounded-lg border border-white/10 bg-elevated px-3 py-2 text-sm text-stone-100 placeholder:text-stone-600 focus:border-emerald-600 focus:outline-none focus:ring-1 focus:ring-emerald-600 sm:w-40"
            />
          </div>

          <div>
            <label className="mb-1 block text-xs font-medium text-stone-300">Carpeta</label>
            <div className="flex flex-wrap gap-2">
              {FOLDER_ORDER.map((option) => (
                <button
                  key={option}
                  type="button"
                  onClick={() => setFolder(option)}
                  className={cn(
                    'rounded-lg border px-3 py-1.5 text-xs font-medium transition',
                    folder === option
                      ? option === 'negocio'
                        ? 'border-gold/40 bg-gold-soft text-gold'
                        : 'border-emerald-600/40 bg-emerald-600/10 text-emerald-400'
                      : 'border-white/10 text-stone-400 hover:border-white/20',
                  )}
                >
                  {FOLDER_LABEL[option]}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="flex items-center gap-2 text-xs font-medium text-stone-300">
              <input
                type="checkbox"
                checked={adjustmentEnabled}
                onChange={(e) => setAdjustmentEnabled(e.target.checked)}
                className="h-3.5 w-3.5 rounded border-white/20 bg-obsidian accent-emerald-600"
              />
              Ajustar automaticamente cada año (IPC u otro %)
            </label>

            {adjustmentEnabled && (
              <div className="mt-2 flex flex-col gap-2 sm:flex-row">
                <input
                  type="number"
                  step="0.01"
                  placeholder="% de ajuste (ej. 7.5)"
                  value={adjustmentPercent}
                  onChange={(e) => setAdjustmentPercent(e.target.value)}
                  className="amount w-full rounded-lg border border-white/10 bg-elevated px-3 py-2 text-sm text-stone-100 placeholder:text-stone-600 focus:border-emerald-600 focus:outline-none focus:ring-1 focus:ring-emerald-600 sm:w-44"
                />
                <div className="w-full sm:w-44">
                  <CustomSelect value={adjustmentMonth} onChange={setAdjustmentMonth} options={MONTH_OPTIONS} />
                </div>
              </div>
            )}
            <p className="mt-1 text-[11px] text-stone-500">
              Se aplica una sola vez por año, sobre el monto vigente, a partir del mes elegido.
            </p>
          </div>

          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={() => {
                setShowForm(false);
                setError(null);
                resetForm();
              }}
              className="rounded-lg px-3 py-1.5 text-xs text-stone-400 hover:text-stone-200"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={isPending}
              className="rounded-lg bg-wealth px-3 py-1.5 text-xs font-medium text-white transition hover:bg-wealth-hover disabled:opacity-50"
            >
              Guardar ingreso fijo
            </button>
          </div>
        </form>
      )}
    </section>
  );
}
