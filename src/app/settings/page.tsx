import Link from 'next/link';
import { getAccountBalances, getCategories, getIdentitySnapshot, getMySubscription, getTransactionHistory } from '@/actions/dashboard';
import { getSpaceMembers } from '@/actions/settings';
import { getMerchantRules } from '@/actions/merchant-rules';
import { listInboundChannels } from '@/actions/inbound-channels';
import { getBudgets } from '@/actions/budgets';
import { getCategoryFiscalTags } from '@/actions/fiscal';
import { listNotificationChannels } from '@/actions/notification-channels';
import { getAlternativeAssets } from '@/actions/assets';
import { canEditSpace, canManageSpace } from '@/domain/permissions';
import { requireActiveSpace } from '@/lib/active-space';
import { AppNav } from '@/components/dashboard/AppNav';
import { RenameSpaceForm } from '@/components/dashboard/RenameSpaceForm';
import { CreateSpaceDialog } from '@/components/dashboard/CreateSpaceDialog';
import { SpaceMembersManager } from '@/components/dashboard/SpaceMembersManager';
import { BalancesGrid } from '@/components/dashboard/BalancesGrid';
import { SessionPreferenceInfo } from '@/components/dashboard/SessionPreferenceInfo';
import { TransactionHistoryList } from '@/components/dashboard/TransactionHistoryList';
import { ImpactSummaryModal } from '@/components/dashboard/ImpactSummaryModal';
import { IdentitySnapshotCard } from '@/components/dashboard/IdentitySnapshotCard';
import { ExportModal } from '@/components/dashboard/ExportModal';
import { AccountDeletionSection } from '@/components/dashboard/AccountDeletionSection';
import { AlertPreferencesForm } from '@/components/dashboard/AlertPreferencesForm';
import { MerchantRulesManager } from '@/components/dashboard/MerchantRulesManager';
import { InboundChannelsManager } from '@/components/dashboard/InboundChannelsManager';
import { BudgetsManager } from '@/components/dashboard/BudgetsManager';
import { FiscalCategoriesManager } from '@/components/dashboard/FiscalCategoriesManager';
import { NotificationChannelsManager } from '@/components/dashboard/NotificationChannelsManager';
import { CreateAccountForm } from '@/components/dashboard/CreateAccountForm';
import { AlternativeAssetsManager } from '@/components/dashboard/AlternativeAssetsManager';
import { AppFooter } from '@/components/AppFooter';
import type { PlanTier } from '@/domain/types/dashboard';

const SUPPORT_EMAIL = process.env.NEXT_PUBLIC_SUPPORT_EMAIL;

const PLAN_LABEL: Record<PlanTier, string> = {
  free: 'Gratuito',
  pro: 'Pro',
  premium: 'Premium',
};

export default async function SettingsPage() {
  const { spaces, activeSpace } = await requireActiveSpace();

  const [
    members,
    balances,
    transactionHistory,
    subscription,
    categories,
    identitySnapshot,
    merchantRules,
    inboundChannels,
    budgets,
    fiscalTags,
    notificationChannels,
    alternativeAssetsData,
  ] = await Promise.all([
    getSpaceMembers(activeSpace.id),
    getAccountBalances(activeSpace.id),
    getTransactionHistory(activeSpace.id),
    getMySubscription(),
    getCategories(activeSpace.id),
    getIdentitySnapshot(activeSpace.id),
    getMerchantRules(activeSpace.id),
    listInboundChannels(activeSpace.id),
    getBudgets(activeSpace.id),
    getCategoryFiscalTags(activeSpace.id),
    listNotificationChannels(activeSpace.id),
    getAlternativeAssets(activeSpace.id, activeSpace.baseCurrency),
  ]);

  // RBAC (Bloque P4): mismo umbral que las politicas RLS (has_space_role) --
  // canEdit = owner/admin/editor (crear/editar datos), canManage = owner/admin
  // (administracion del espacio: renombrar, miembros/roles, eliminar).
  const canEdit = canEditSpace(activeSpace.role);
  const canManage = canManageSpace(activeSpace.role);
  // Monetizacion asimetrica: solo los espacios de Negocio sin Pro pierden la
  // exportacion para contadores. Personal/Familiar/Proyecto siempre la tienen.
  const exportRequiresPro = activeSpace.type === 'business' && !activeSpace.isPro;

  return (
    <main className="min-h-screen bg-obsidian text-stone-100">
      <AppNav spaces={spaces} activeSpaceId={activeSpace.id} activePath="settings" />

      <div className="mx-auto flex max-w-5xl flex-col gap-6 px-6 py-8 pb-24 sm:pb-8">
        <div>
          <h1 className="text-xl font-medium">Ajustes del espacio</h1>
          <p className="mt-1 text-sm text-stone-500">
            Gestiona el nombre, los miembros y las cuentas de <span className="text-stone-300">{activeSpace.name}</span>.
          </p>
        </div>

        {/* En movil, la barra inferior solo tiene espacio para 4 destinos
            (Panorama, Captura, Movimientos, Ajustes) -- Panorama Conjunto y
            Privacidad quedan igual de alcanzables desde aqui, en vez de
            perderse por completo al no estar en la barra fija. */}
        <div className="flex flex-wrap gap-4 sm:hidden">
          <Link href="/overview" className="text-sm font-medium text-emerald-400 hover:underline">
            Panorama Conjunto →
          </Link>
          <Link href="/privacy" className="text-sm font-medium text-emerald-400 hover:underline">
            Centro de Privacidad →
          </Link>
        </div>

        {/* Protagonismo de "Asi te conozco": ya no es un boton escondido que
            abre un modal -- es lo primero que se ve al entrar a Ajustes,
            con el mismo lenguaje visual que el Resumen de Impacto. */}
        <IdentitySnapshotCard snapshot={identitySnapshot} spaceName={activeSpace.name} />

        <section className="rounded-xl border border-white/10 bg-elevated p-5">
          <h2 className="mb-3 text-sm font-medium text-stone-200">Nombre del espacio</h2>
          <RenameSpaceForm spaceId={activeSpace.id} currentName={activeSpace.name} canEdit={canManage} />
        </section>

        <section className="rounded-xl border border-white/10 bg-elevated p-5">
          <div className="mb-3 flex items-center justify-between gap-3">
            <h2 className="text-sm font-medium text-stone-200">Miembros del Espacio ({members.length})</h2>
            <CreateSpaceDialog triggerLabel="+ Nuevo espacio" />
          </div>
          <SpaceMembersManager spaceId={activeSpace.id} members={members} canManage={canManage} />
        </section>

        <section className="rounded-xl border border-white/10 bg-elevated p-5">
          <h2 className="mb-3 text-sm font-medium text-stone-200">Sesion</h2>
          <SessionPreferenceInfo />
        </section>

        <section className="rounded-xl border border-white/10 bg-elevated p-5">
          <h2 className="mb-1 text-sm font-medium text-stone-200">Preferencias de Alertas</h2>
          <p className="mb-3 text-xs text-stone-500">
            Con cuanta anticipacion avisar de una factura por vencer -- dentro de la app siempre, y por los canales de
            abajo si tienes alguno activo.
          </p>
          <AlertPreferencesForm spaceId={activeSpace.id} currentBillReminderDays={activeSpace.billReminderDays} canEdit={canManage} />
        </section>

        <section className="rounded-xl border border-white/10 bg-elevated p-5">
          <h2 className="mb-1 text-sm font-medium text-stone-200">Canales de Notificacion</h2>
          <p className="mb-3 text-xs text-stone-500">
            Webhook (Slack, Discord, Zapier, tu servidor) o tu propio bot de Telegram -- Lumen te avisa ahi ademas de
            dentro de la app cuando una factura entra en su ventana de aviso. Solo owner/admin pueden verlos o
            cambiarlos, porque guardan una credencial en claro.
          </p>
          <NotificationChannelsManager spaceId={activeSpace.id} channels={notificationChannels} canManage={canManage} />
        </section>

        <section className="rounded-xl border border-white/10 bg-elevated p-5">
          <h2 className="mb-1 text-sm font-medium text-stone-200">Categorizacion Automatica</h2>
          <p className="mb-3 text-xs text-stone-500">
            Reglas por comercio: si la descripcion de una captura nueva coincide, se precargan categoria/cuenta/etiquetas/carpeta.
          </p>
          <MerchantRulesManager
            spaceId={activeSpace.id}
            rules={merchantRules}
            categories={categories}
            accounts={balances.accounts.map((a) => ({ accountId: a.accountId, name: a.name }))}
            canEdit={canEdit}
            canManage={canManage}
          />
        </section>

        <section className="rounded-xl border border-white/10 bg-elevated p-5">
          <h2 className="mb-3 text-sm font-medium text-stone-200">Bandeja Automatica</h2>
          <InboundChannelsManager spaceId={activeSpace.id} channels={inboundChannels} canManage={canManage} />
        </section>

        <section className="rounded-xl border border-white/10 bg-elevated p-5">
          <h2 className="mb-1 text-sm font-medium text-stone-200">Presupuestos</h2>
          <p className="mb-3 text-xs text-stone-500">
            Un monto mensual por categoria de gasto -- el Reporte Mensual del Panorama lo compara contra lo que realmente gastaste.
          </p>
          <BudgetsManager
            spaceId={activeSpace.id}
            budgets={budgets}
            categories={categories}
            baseCurrency={balances.baseCurrency}
            canEdit={canEdit}
            canManage={canManage}
          />
        </section>

        <section className="rounded-xl border border-white/10 bg-elevated p-5">
          <h2 className="mb-1 text-sm font-medium text-stone-200">Clasificacion Tributaria</h2>
          <p className="mb-3 text-xs text-stone-500">
            Marca cada categoria como gravado/exento/no gravado (ingresos) o deducible/no deducible (gastos) -- tu lo
            sabes, Lumen solo suma. Alimenta el Resumen Fiscal del Panorama y el Paquete Contable exportable.
          </p>
          <FiscalCategoriesManager
            spaceId={activeSpace.id}
            spaceType={activeSpace.type}
            categories={categories}
            tags={fiscalTags}
            canEdit={canEdit}
            canManage={canManage}
          />
        </section>

        <section className="rounded-xl border border-white/10 bg-elevated p-5">
          <h2 className="mb-3 text-sm font-medium text-stone-200">Cuentas</h2>
          <BalancesGrid baseCurrency={balances.baseCurrency} accounts={balances.accounts} />
          {canEdit && <CreateAccountForm spaceId={activeSpace.id} baseCurrency={activeSpace.baseCurrency} />}
        </section>

        <section className="rounded-xl border border-white/10 bg-elevated p-5">
          <h2 className="mb-1 text-sm font-medium text-stone-200">Activos Alternativos</h2>
          <p className="mb-3 text-xs text-stone-500">
            Inversiones, criptoactivos y bienes patrimoniales que no son una cuenta transaccional -- se muestran aparte
            del Patrimonio Neto de tus cuentas.
          </p>
          <AlternativeAssetsManager
            spaceId={activeSpace.id}
            assets={alternativeAssetsData.assets}
            totalBase={alternativeAssetsData.totalBase}
            baseCurrency={activeSpace.baseCurrency}
            canEdit={canEdit}
            canManage={canManage}
          />
        </section>

        <section className="rounded-xl border border-white/10 bg-elevated p-5">
          <div className="flex items-center justify-between gap-3">
            <h2 className="text-sm font-medium text-stone-200">Historial de movimientos</h2>
            <div className="flex items-center gap-3">
              <span className="text-xs text-stone-500">Ultimos {transactionHistory.length}</span>
              <ImpactSummaryModal spaceId={activeSpace.id} />
            </div>
          </div>
          <div className="mt-3">
            <TransactionHistoryList
              spaceId={activeSpace.id}
              items={transactionHistory}
              categories={categories}
              canDelete={canManage}
            />
          </div>
        </section>

        <section className="rounded-xl border border-white/10 bg-elevated p-5">
          <div className="flex items-center justify-between gap-3">
            <div>
              <h2 className="text-sm font-medium text-stone-200">Exportar reportes</h2>
              <p className="mt-1 text-xs text-stone-500">Excel de grado profesional, o CSV/JSON con tus datos crudos -- portabilidad total.</p>
            </div>
            {exportRequiresPro ? (
              <span className="shrink-0 rounded-lg border border-white/10 px-3 py-2 text-xs text-stone-500">
                Disponible con Lumen Pro
              </span>
            ) : (
              <ExportModal spaceId={activeSpace.id} />
            )}
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

        {/* Privacidad y Seguridad: al final de Ajustes a proposito -- es la
            seccion menos frecuente, nunca la primera que se ve, pero clara
            y facil de encontrar cuando se necesita (Habeas Data, Ley 1581
            de 2012 -- derecho a pedir la supresion de los datos). */}
        <section className="rounded-xl border border-white/10 bg-elevated p-5">
          <h2 className="mb-2 text-sm font-medium text-stone-200">Privacidad y Seguridad</h2>
          <p className="mb-3 text-xs text-stone-500">
            Eliminar tu cuenta borra tu perfil y los espacios de los que eres unica/o integrante, de forma permanente.
          </p>
          <AccountDeletionSection />
        </section>
      </div>
      <AppFooter />
    </main>
  );
}
