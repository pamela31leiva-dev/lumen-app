import { getCategories, getTransactionHistory } from '@/actions/dashboard';
import { canEditSpace, canManageSpace } from '@/domain/permissions';
import { requireActiveSpace } from '@/lib/active-space';
import { AppNav } from '@/components/dashboard/AppNav';
import { TransactionHistoryList } from '@/components/dashboard/TransactionHistoryList';
import { ImpactSummaryModal } from '@/components/dashboard/ImpactSummaryModal';

/**
 * Bloque P6 (PWA/Mobile-First): "Movimientos" pasa de vivir enterrado dentro
 * de Ajustes a ser una seccion propia, alcanzable de un toque desde la barra
 * inferior -- es la pantalla que mas se consulta en movil (revisar el ultimo
 * gasto capturado) y antes exigia entrar a Ajustes y bajar varias secciones.
 * Reutiliza el mismo historial/lista que ya existia en /settings; no duplica
 * datos ni logica, solo la hace mas facil de encontrar.
 */
export default async function MovimientosPage() {
  const { spaces, activeSpace } = await requireActiveSpace();

  const [transactionHistory, categories] = await Promise.all([
    getTransactionHistory(activeSpace.id),
    getCategories(activeSpace.id),
  ]);

  const canEdit = canEditSpace(activeSpace.role);
  const canManage = canManageSpace(activeSpace.role);

  return (
    <main className="min-h-screen bg-page text-stone-100">
      <AppNav spaces={spaces} activeSpaceId={activeSpace.id} activePath="movimientos" />

      <div className="mx-auto flex max-w-5xl flex-col gap-6 px-6 py-8 pb-24 sm:pb-8">
        <div>
          <h1 className="text-xl font-medium">Movimientos</h1>
          <p className="mt-1 text-sm text-stone-500">
            Los ultimos {transactionHistory.length} movimientos confirmados de <span className="text-stone-300">{activeSpace.name}</span>.
          </p>
        </div>

        <section className="rounded-xl border border-white/10 bg-elevated p-5">
          <div className="flex items-center justify-between gap-3">
            <h2 className="text-sm font-medium text-stone-200">Historial</h2>
            <ImpactSummaryModal spaceId={activeSpace.id} />
          </div>
          <div className="mt-3">
            <TransactionHistoryList
              spaceId={activeSpace.id}
              items={transactionHistory}
              categories={categories}
              canDelete={canManage}
              canEdit={canEdit}
            />
          </div>
        </section>
      </div>
    </main>
  );
}
