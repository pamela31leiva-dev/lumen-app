import type { TransactionHistoryItem } from '@/domain/types/dashboard';
import { FOLDER_LABEL, FOLDER_ORDER, folderOf, type Folder } from '@/domain/folders';
import { cn, formatMoney } from '@/lib/utils';

const TYPE_LABEL: Record<TransactionHistoryItem['type'], string> = {
  income: 'Ingreso',
  expense: 'Gasto',
  transfer: 'Transferencia',
};

interface RecentActivityCardProps {
  items: TransactionHistoryItem[];
}

function groupByFolder(items: TransactionHistoryItem[]): Map<Folder, TransactionHistoryItem[]> {
  const groups = new Map<Folder, TransactionHistoryItem[]>();
  for (const item of items) {
    const folder = folderOf(item);
    const list = groups.get(folder) ?? [];
    list.push(item);
    groups.set(folder, list);
  }
  return groups;
}

/**
 * "Concepto y Destino como Protagonistas": el numero solo no dice nada de en
 * que se fue la plata -- esta tarjeta empareja cada movimiento reciente con
 * su descripcion en texto natural. Agrupada por carpeta (Personal/Familiar/
 * Salud/Negocio) en vez de una sola lista cronologica generica -- para que
 * nunca se sienta una caja desordenada de movimientos sin relacion entre si.
 * El encabezado de carpeta solo aparece cuando hay mas de una representada
 * entre los ultimos movimientos (Cero Ruido: si todo es Personal, agrupar no
 * aporta nada). Nunca un signo "-" ni rojo: el monto siempre en su valor
 * absoluto, solo un verde sutil para ingresos.
 */
export function RecentActivityCard({ items }: RecentActivityCardProps) {
  if (items.length === 0) return null;

  const groups = groupByFolder(items);
  const showFolderHeaders = groups.size > 1;
  const orderedFolders = FOLDER_ORDER.filter((f) => groups.has(f));

  return (
    <section className="rounded-xl border border-white/10 bg-elevated p-5 transition-colors hover:border-gold/15">
      <p className="text-[11px] font-medium uppercase tracking-[0.2em] text-stone-500">Ultimos Movimientos</p>

      <div className="mt-3 flex flex-col gap-4">
        {orderedFolders.map((folder) => (
          <div key={folder}>
            {showFolderHeaders && (
              <p className="mb-1.5 text-[10px] font-medium uppercase tracking-wide text-stone-600">{FOLDER_LABEL[folder]}</p>
            )}
            <ul className="flex flex-col divide-y divide-white/10">
              {groups.get(folder)!.map((item) => (
                <li key={item.id} className="flex items-center justify-between gap-3 py-2.5">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="truncate text-sm text-stone-100">{item.description ?? TYPE_LABEL[item.type]}</p>
                      {!showFolderHeaders && folder !== 'personal' && (
                        <span className="shrink-0 rounded-full bg-white/5 px-2 py-0.5 text-[10px] font-medium text-stone-400">
                          {FOLDER_LABEL[folder]}
                        </span>
                      )}
                    </div>
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
          </div>
        ))}
      </div>
    </section>
  );
}
