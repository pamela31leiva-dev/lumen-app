import type { TransactionHistoryItem } from '@/domain/types/dashboard';
import { cn, formatMoney } from '@/lib/utils';

const TYPE_LABEL: Record<TransactionHistoryItem['type'], string> = {
  income: 'Ingreso',
  expense: 'Gasto',
  transfer: 'Transferencia',
};

interface RecentActivityCardProps {
  items: TransactionHistoryItem[];
}

/**
 * "Concepto y Destino como Protagonistas": el numero solo no dice nada de en
 * que se fue la plata -- esta tarjeta empareja cada movimiento reciente con
 * su descripcion en texto natural, justo debajo del balance agregado. Nunca
 * un signo "-" ni rojo: el monto siempre en su valor absoluto (el tipo y la
 * descripcion ya dan el contexto), solo un verde sutil para ingresos.
 */
export function RecentActivityCard({ items }: RecentActivityCardProps) {
  if (items.length === 0) return null;

  return (
    <section className="rounded-xl border border-white/10 bg-elevated p-5 transition-colors hover:border-gold/15">
      <p className="text-[11px] font-medium uppercase tracking-[0.2em] text-stone-500">Ultimos Movimientos</p>
      <ul className="mt-3 flex flex-col divide-y divide-white/10">
        {items.map((item) => (
          <li key={item.id} className="flex items-center justify-between gap-3 py-2.5">
            <div className="min-w-0">
              <p className="truncate text-sm text-stone-100">{item.description ?? TYPE_LABEL[item.type]}</p>
              <p className="text-xs text-stone-500">
                {new Date(item.transactionDate).toLocaleDateString('es-CO')} · {item.categoryName ?? TYPE_LABEL[item.type]}
              </p>
            </div>
            <span
              className={cn(
                'amount shrink-0 text-sm font-medium',
                item.type === 'income' ? 'text-growth' : 'text-stone-300',
              )}
            >
              {formatMoney(item.amountOriginal, item.currencyOriginal)}
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}
