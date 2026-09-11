'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { updateOpeningBalance } from '@/actions/accounts';
import type { AccountBalance, AccountType } from '@/domain/types/dashboard';
import { cn, formatMoney } from '@/lib/utils';

const GROUP_ORDER: AccountType[] = ['bank', 'cash', 'digital_wallet', 'credit_card', 'investment', 'other'];

const GROUP_LABEL: Record<AccountType, string> = {
  bank: 'Banco',
  cash: 'Efectivo',
  digital_wallet: 'Billetera digital',
  credit_card: 'Tarjeta de credito',
  investment: 'Inversion',
  other: 'Otros',
};

interface BalancesGridProps {
  baseCurrency: string;
  accounts: AccountBalance[];
}

/**
 * Detalle por cuenta — informacion de consulta, no de decision diaria, por
 * eso vive separada del Hero de Patrimonio Neto (ver NetWorthHero). En el
 * Executive Action Board se muestra colapsada por defecto ("Cero Ruido");
 * en /settings se muestra siempre abierta.
 *
 * "Establecer saldo inicial" es la unica forma de declarar activos reales:
 * sin ella, toda cuenta se queda en $0 para siempre y "Patrimonio Neto"
 * nunca podria mostrarse (ver hasRealAssets en getAccountBalances /
 * NetWorthHero) -- este es el cierre de ese circuito, no gestion de cuentas.
 */
export function BalancesGrid({ baseCurrency, accounts }: BalancesGridProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draftValue, setDraftValue] = useState('');
  const [error, setError] = useState<string | null>(null);

  const grouped = GROUP_ORDER.map((type) => ({
    type,
    accounts: accounts.filter((a) => a.type === type),
  })).filter((group) => group.accounts.length > 0);

  function startEditing(account: AccountBalance) {
    setError(null);
    setEditingId(account.accountId);
    setDraftValue(account.openingBalance > 0 ? String(account.openingBalance) : '');
  }

  function handleSave(account: AccountBalance) {
    const parsed = Number(draftValue);
    if (!Number.isFinite(parsed) || parsed < 0) {
      setError('Escribe un numero valido, cero o mayor.');
      return;
    }
    setError(null);
    startTransition(async () => {
      const result = await updateOpeningBalance(account.accountId, account.spaceId, parsed);
      if (!result.success) {
        setError(result.error);
        return;
      }
      setEditingId(null);
      router.refresh();
    });
  }

  if (grouped.length === 0) {
    return <p className="text-sm text-stone-500">Aun no hay cuentas registradas en este espacio.</p>;
  }

  return (
    <div className="flex flex-col gap-6">
      {grouped.map((group) => (
        <div key={group.type}>
          <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-stone-500">
            {GROUP_LABEL[group.type]}
          </h3>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {group.accounts.map((account) => {
              const showOriginal = account.currency !== baseCurrency;
              const isEditing = editingId === account.accountId;
              return (
                <div
                  key={account.accountId}
                  className={cn(
                    'rounded-lg border border-white/10 bg-obsidian p-4 transition-colors hover:border-gold/15',
                    !account.isActive && 'opacity-50',
                  )}
                >
                  <div className="flex items-start justify-between gap-2">
                    <p className="text-sm font-medium text-stone-100">{account.name}</p>
                    <span
                      className={cn(
                        'shrink-0 rounded-full px-2 py-0.5 text-[10px] font-medium',
                        account.isActive ? 'bg-growth/15 text-growth' : 'bg-white/10 text-stone-500',
                      )}
                    >
                      {account.isActive ? 'Activa' : 'Inactiva'}
                    </span>
                  </div>
                  <p
                    className={cn(
                      'amount mt-2 text-lg font-semibold',
                      account.currentBalance >= 0 ? 'text-growth' : 'text-stone-200',
                    )}
                  >
                    {formatMoney(account.currentBalance, baseCurrency)}
                  </p>
                  {showOriginal && (
                    <p className="amount mt-0.5 text-xs text-gold">
                      {formatMoney(account.currentBalanceOriginal, account.currency)} en {account.currency}
                    </p>
                  )}

                  {isEditing ? (
                    <div className="mt-3 flex items-center gap-1.5">
                      <input
                        type="number"
                        min="0"
                        step="0.01"
                        autoFocus
                        value={draftValue}
                        onChange={(e) => setDraftValue(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') handleSave(account);
                          if (e.key === 'Escape') setEditingId(null);
                        }}
                        disabled={isPending}
                        className="amount w-full min-w-0 rounded-md border border-white/10 bg-elevated px-2 py-1 text-xs text-stone-100 focus:border-emerald-600 focus:outline-none focus:ring-1 focus:ring-emerald-600"
                      />
                      <button
                        type="button"
                        onClick={() => handleSave(account)}
                        disabled={isPending}
                        className="shrink-0 rounded-md bg-wealth px-2 py-1 text-[11px] font-medium text-white hover:bg-wealth-hover disabled:opacity-50"
                      >
                        Guardar
                      </button>
                      <button
                        type="button"
                        onClick={() => setEditingId(null)}
                        disabled={isPending}
                        className="shrink-0 rounded-md px-1.5 py-1 text-[11px] text-stone-500 hover:text-stone-300"
                      >
                        Cancelar
                      </button>
                    </div>
                  ) : (
                    <button
                      type="button"
                      onClick={() => startEditing(account)}
                      className="mt-2 text-[11px] text-stone-500 underline decoration-white/20 underline-offset-2 hover:text-stone-300"
                    >
                      {account.openingBalance > 0
                        ? `Saldo inicial: ${formatMoney(account.openingBalance, account.currency)}`
                        : 'Establecer saldo inicial'}
                    </button>
                  )}
                  {isEditing && error && <p className="mt-1.5 text-[11px] text-red-400">{error}</p>}
                </div>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}
