'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { createAccount } from '@/actions/accounts';
import { CustomSelect } from '@/components/ui/CustomSelect';
import { CURRENCY_OPTIONS } from '@/domain/currency';
import type { AccountType } from '@/domain/types/dashboard';

const TYPE_OPTIONS: { value: AccountType; label: string }[] = [
  { value: 'bank', label: 'Banco' },
  { value: 'cash', label: 'Efectivo' },
  { value: 'digital_wallet', label: 'Billetera digital' },
  { value: 'credit_card', label: 'Tarjeta de credito' },
  { value: 'investment', label: 'Inversion' },
  { value: 'other', label: 'Otros' },
];

interface CreateAccountFormProps {
  spaceId: string;
  baseCurrency: string;
}

/**
 * Hasta el Bloque P7 la unica cuenta posible era la "Efectivo" que Lumen crea
 * sola al confirmar el primer movimiento -- esto es lo que faltaba para
 * "registrar cuentas en diferentes monedas" de verdad: elegir nombre, tipo y
 * moneda a proposito (ej. una cuenta en USD para ahorros en dolares).
 */
export function CreateAccountForm({ spaceId, baseCurrency }: CreateAccountFormProps) {
  const router = useRouter();
  const [showForm, setShowForm] = useState(false);
  const [name, setName] = useState('');
  const [type, setType] = useState<AccountType>('bank');
  const [currency, setCurrency] = useState(baseCurrency);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function handleCreate() {
    setError(null);
    if (!name.trim()) {
      setError('Escribe un nombre para la cuenta.');
      return;
    }
    startTransition(async () => {
      const result = await createAccount(spaceId, name, type, currency);
      if (!result.success) {
        setError(result.error);
        return;
      }
      setShowForm(false);
      setName('');
      setType('bank');
      setCurrency(baseCurrency);
      router.refresh();
    });
  }

  if (!showForm) {
    return (
      <button type="button" onClick={() => setShowForm(true)} className="mt-3 text-xs font-medium text-gold hover:underline">
        + Nueva cuenta
      </button>
    );
  }

  return (
    <div className="mt-3 flex flex-col gap-3 rounded-lg border border-white/10 bg-obsidian p-4 sm:flex-row sm:items-end">
      <div className="flex-1">
        <label className="mb-1 block text-xs font-medium text-stone-300">Nombre</label>
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="ej. Ahorros en dolares"
          className="w-full rounded-lg border border-white/10 bg-elevated px-3 py-2 text-sm text-stone-100 placeholder:text-stone-600 focus:border-emerald-600 focus:outline-none focus:ring-1 focus:ring-emerald-600"
        />
      </div>
      <div className="w-full sm:w-40">
        <label className="mb-1 block text-xs font-medium text-stone-300">Tipo</label>
        <CustomSelect value={type} onChange={(v) => setType(v as AccountType)} options={TYPE_OPTIONS} />
      </div>
      <div className="w-full sm:w-36">
        <label className="mb-1 block text-xs font-medium text-stone-300">Moneda</label>
        <CustomSelect value={currency} onChange={setCurrency} options={CURRENCY_OPTIONS} />
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
          {isPending ? 'Creando...' : 'Crear cuenta'}
        </button>
      </div>
      {error && <p className="text-xs text-red-400 sm:basis-full">{error}</p>}
    </div>
  );
}
