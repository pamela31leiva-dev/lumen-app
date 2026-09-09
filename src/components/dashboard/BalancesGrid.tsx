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
 * Presentacional y sin llamadas a Supabase: recibe los datos ya calculados
 * por Postgres via la Server Action getAccountBalances (vista account_balances).
 */
export function BalancesGrid({ baseCurrency, accounts }: BalancesGridProps) {
  const grouped = GROUP_ORDER.map((type) => ({
    type,
    accounts: accounts.filter((a) => a.type === type),
  })).filter((group) => group.accounts.length > 0);

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
                </div>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}
