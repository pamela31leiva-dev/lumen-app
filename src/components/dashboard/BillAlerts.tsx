'use client';

import { useState, useTransition, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { createBill, markBillPaid, type BillSummary } from '@/actions/bills';
import { cn, formatMoney } from '@/lib/utils';

interface BillAlertsProps {
  spaceId: string;
  bills: BillSummary[];
}

function dueDateLabel(daysUntilDue: number): string {
  if (daysUntilDue < 0) return `Vencio hace ${Math.abs(daysUntilDue)} dia${Math.abs(daysUntilDue) === 1 ? '' : 's'}`;
  if (daysUntilDue === 0) return 'Vence hoy';
  if (daysUntilDue === 1) return 'Vence mañana';
  return `Vence en ${daysUntilDue} dias`;
}

/**
 * Modulo de Facturas y Alertas de Vencimiento: a diferencia del resto de la
 * app (que evita el rojo para no sonar punitiva sobre gastos ya hechos),
 * aqui SI se usa rojo para lo ya vencido -- es una alerta operativa real
 * (riesgo de corte de servicio), no un juicio sobre un gasto pasado. Ambar
 * para lo que vence en <=3 dias, siguiendo el mismo lenguaje del resto.
 */
export function BillAlerts({ spaceId, bills }: BillAlertsProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [payingId, setPayingId] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [description, setDescription] = useState('');
  const [amount, setAmount] = useState('');
  const [dueDate, setDueDate] = useState('');
  const [error, setError] = useState<string | null>(null);

  const urgentBills = bills.filter((b) => b.daysUntilDue <= 3);

  function handlePay(billId: string) {
    setError(null);
    setPayingId(billId);
    startTransition(async () => {
      const result = await markBillPaid(spaceId, billId);
      if (!result.success) {
        setError(result.error);
        setPayingId(null);
        return;
      }
      router.refresh();
    });
  }

  function handleCreate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    const parsedAmount = Number(amount);
    if (!description.trim() || !Number.isFinite(parsedAmount) || parsedAmount <= 0 || !dueDate) {
      setError('Completa descripcion, monto y fecha limite.');
      return;
    }
    startTransition(async () => {
      const result = await createBill(spaceId, description.trim(), parsedAmount, 'COP', dueDate);
      if (!result.success) {
        setError(result.error);
        return;
      }
      setDescription('');
      setAmount('');
      setDueDate('');
      setShowForm(false);
      router.refresh();
    });
  }

  return (
    <div className="flex flex-col gap-3">
      {urgentBills.map((bill) => {
        const overdue = bill.daysUntilDue < 0;
        return (
          <div
            key={bill.id}
            className={cn(
              'animate-fade-scale-in rounded-xl border p-4',
              overdue ? 'border-red-500/30 bg-red-950/20' : 'border-gold/30 bg-gold-soft',
            )}
          >
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <p className="text-sm text-stone-100">{bill.description}</p>
                <p className={cn('amount mt-0.5 text-xs', overdue ? 'text-red-400' : 'text-gold')}>
                  {formatMoney(bill.amount, bill.currency)} · {dueDateLabel(bill.daysUntilDue)}
                </p>
              </div>
              <button
                type="button"
                onClick={() => handlePay(bill.id)}
                disabled={isPending && payingId === bill.id}
                className={cn(
                  'shrink-0 rounded-lg px-3 py-1.5 text-xs font-medium transition disabled:opacity-60',
                  overdue ? 'bg-red-500/90 text-white hover:bg-red-500' : 'bg-gold text-obsidian hover:bg-gold/90',
                )}
              >
                {isPending && payingId === bill.id ? 'Registrando...' : 'Ya la pague'}
              </button>
            </div>
          </div>
        );
      })}

      {error && <p className="text-xs text-red-400">{error}</p>}

      {showForm ? (
        <form onSubmit={handleCreate} className="flex flex-col gap-2 rounded-xl border border-white/10 bg-elevated p-4">
          <div className="flex flex-col gap-2 sm:flex-row">
            <input
              type="text"
              placeholder="Ej. Recibo de luz"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="min-w-0 flex-1 rounded-lg border border-white/10 bg-obsidian px-3 py-2 text-sm text-stone-100 placeholder:text-stone-600 focus:border-emerald-600 focus:outline-none focus:ring-1 focus:ring-emerald-600"
            />
            <input
              type="number"
              min="0"
              step="0.01"
              placeholder="Monto"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              className="amount w-full rounded-lg border border-white/10 bg-obsidian px-3 py-2 text-sm text-stone-100 placeholder:text-stone-600 focus:border-emerald-600 focus:outline-none focus:ring-1 focus:ring-emerald-600 sm:w-32"
            />
            <input
              type="date"
              value={dueDate}
              onChange={(e) => setDueDate(e.target.value)}
              className="w-full rounded-lg border border-white/10 bg-obsidian px-3 py-2 text-sm text-stone-100 focus:border-emerald-600 focus:outline-none focus:ring-1 focus:ring-emerald-600 sm:w-auto"
            />
          </div>
          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={() => setShowForm(false)}
              className="rounded-lg px-3 py-1.5 text-xs text-stone-400 hover:text-stone-200"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={isPending}
              className="rounded-lg bg-wealth px-3 py-1.5 text-xs font-medium text-white transition hover:bg-wealth-hover disabled:opacity-50"
            >
              Guardar factura
            </button>
          </div>
        </form>
      ) : (
        <button
          type="button"
          onClick={() => setShowForm(true)}
          className="self-start text-xs text-stone-500 underline decoration-white/20 underline-offset-2 hover:text-stone-300"
        >
          + Agregar factura o recibo pendiente
        </button>
      )}
    </div>
  );
}
