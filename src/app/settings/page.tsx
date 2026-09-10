import { getAccountBalances, getMySubscription, getTransactionHistory } from '@/actions/dashboard';
import { getSpaceMembers } from '@/actions/settings';
import { requireActiveSpace } from '@/lib/active-space';
import { AppNav } from '@/components/dashboard/AppNav';
import { RenameSpaceForm } from '@/components/dashboard/RenameSpaceForm';
import { CreateSpaceDialog } from '@/components/dashboard/CreateSpaceDialog';
import { BalancesGrid } from '@/components/dashboard/BalancesGrid';
import { SessionPreferenceInfo } from '@/components/dashboard/SessionPreferenceInfo';
import { TransactionHistoryList } from '@/components/dashboard/TransactionHistoryList';
import { AppFooter } from '@/components/AppFooter';
import type { PlanTier } from '@/domain/types/dashboard';

const SUPPORT_EMAIL = process.env.NEXT_PUBLIC_SUPPORT_EMAIL;

const ROLE_LABEL: Record<string, string> = {
  owner: 'Owner',
  admin: 'Admin',
  editor: 'Editor',
  viewer: 'Solo lectura',
};

const PLAN_LABEL: Record<PlanTier, string> = {
  free: 'Gratuito',
  pro: 'Pro',
  premium: 'Premium',
};

export default async function SettingsPage() {
  const { spaces, activeSpace } = await requireActiveSpace();

  const [members, balances, transactionHistory, subscription] = await Promise.all([
    getSpaceMembers(activeSpace.id),
    getAccountBalances(activeSpace.id),
    getTransactionHistory(activeSpace.id),
    getMySubscription(),
  ]);

  const canEditSpace = activeSpace.role === 'owner' || activeSpace.role === 'admin';

  return (
    <main className="min-h-screen bg-obsidian text-stone-100">
      <AppNav spaces={spaces} activeSpaceId={activeSpace.id} activePath="settings" />

      <div className="mx-auto flex max-w-5xl flex-col gap-6 px-6 py-8">
        <div>
          <h1 className="text-xl font-medium">Ajustes del espacio</h1>
          <p className="mt-1 text-sm text-stone-500">
            Gestiona el nombre, los miembros y las cuentas de <span className="text-stone-300">{activeSpace.name}</span>.
          </p>
        </div>

        <section className="rounded-xl border border-white/10 bg-elevated p-5">
          <h2 className="mb-3 text-sm font-medium text-stone-200">Nombre del espacio</h2>
          <RenameSpaceForm spaceId={activeSpace.id} currentName={activeSpace.name} canEdit={canEditSpace} />
        </section>

        <section className="rounded-xl border border-white/10 bg-elevated p-5">
          <div className="flex items-center justify-between gap-3">
            <h2 className="text-sm font-medium text-stone-200">Miembros ({members.length})</h2>
            <CreateSpaceDialog triggerLabel="+ Nuevo espacio" />
          </div>
          <ul className="mt-4 flex flex-col divide-y divide-white/10">
            {members.map((member) => (
              <li key={member.userId} className="flex items-center justify-between gap-3 py-3">
                <div>
                  <p className="text-sm text-stone-100">{member.fullName ?? member.email}</p>
                  {member.fullName && <p className="text-xs text-stone-500">{member.email}</p>}
                </div>
                <span className="shrink-0 rounded-full bg-emerald-600/15 px-2.5 py-1 text-[11px] font-medium text-emerald-400">
                  {ROLE_LABEL[member.role] ?? member.role}
                </span>
              </li>
            ))}
            {members.length === 0 && <p className="py-3 text-sm text-stone-500">No hay miembros para mostrar.</p>}
          </ul>
        </section>

        <section className="rounded-xl border border-white/10 bg-elevated p-5">
          <h2 className="mb-3 text-sm font-medium text-stone-200">Sesion</h2>
          <SessionPreferenceInfo />
        </section>

        <section className="rounded-xl border border-white/10 bg-elevated p-5">
          <h2 className="mb-3 text-sm font-medium text-stone-200">Cuentas</h2>
          <BalancesGrid baseCurrency={balances.baseCurrency} accounts={balances.accounts} />
        </section>

        <section className="rounded-xl border border-white/10 bg-elevated p-5">
          <div className="flex items-center justify-between gap-3">
            <h2 className="text-sm font-medium text-stone-200">Historial de movimientos</h2>
            <span className="text-xs text-stone-500">Ultimos {transactionHistory.length}</span>
          </div>
          <div className="mt-3">
            <TransactionHistoryList spaceId={activeSpace.id} items={transactionHistory} canDelete={canEditSpace} />
          </div>
        </section>

        <section className="rounded-xl border border-white/10 bg-elevated p-5">
          <h2 className="mb-2 text-sm font-medium text-stone-200">Plan</h2>
          <p className="text-sm text-stone-300">
            {PLAN_LABEL[subscription.plan]}
            {subscription.status !== 'active' && <span className="ml-2 text-xs text-stone-500">({subscription.status})</span>}
          </p>
          <p className="mt-1 text-xs text-stone-500">
            Tu historico y espacios se conservan intactos aunque tu plan cambie o quede inactivo.
          </p>
        </section>

        {SUPPORT_EMAIL && (
          <section className="rounded-xl border border-white/10 bg-elevated p-5">
            <h2 className="mb-2 text-sm font-medium text-stone-200">Soporte</h2>
            <p className="text-sm text-stone-400">
              ¿Algo no se ve bien?{' '}
              <a href={`mailto:${SUPPORT_EMAIL}`} className="text-gold hover:underline">
                {SUPPORT_EMAIL}
              </a>
            </p>
          </section>
        )}
      </div>
      <AppFooter />
    </main>
  );
}
