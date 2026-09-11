import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { getAccountBalances, getCategories, getMonthlyNetFlow, getPendingTransactions, getTransactionHistory, getUserSpaces } from '@/actions/dashboard';
import { getBusinessCashInsight, getCashFlowProjection, getProactiveInsights } from '@/actions/analytics';
import { getSpaceMembers } from '@/actions/settings';
import { getSupabaseServerClient } from '@/infrastructure/supabase/server';
import { ACTIVE_SPACE_COOKIE } from '@/lib/constants';
import { AppNav } from '@/components/dashboard/AppNav';
import { CreateSpaceDialog } from '@/components/dashboard/CreateSpaceDialog';
import { NetWorthHero } from '@/components/dashboard/NetWorthHero';
import { ActionFeed } from '@/components/dashboard/ActionFeed';
import { CommandConsole } from '@/components/dashboard/CommandConsole';
import { LazyBalancesGrid } from '@/components/dashboard/LazyBalancesGrid';
import { SaveSpaceBanner } from '@/components/dashboard/SaveSpaceBanner';
import { BusinessCashCard } from '@/components/dashboard/BusinessCashCard';
import { BusinessProUpsell } from '@/components/dashboard/BusinessProUpsell';
import { CashFlowProjectionCard } from '@/components/dashboard/CashFlowProjectionCard';
import { RecentActivityCard } from '@/components/dashboard/RecentActivityCard';
import { RealtimeSpaceSync } from '@/components/dashboard/RealtimeSpaceSync';

/**
 * Executive Action Board — reemplaza el "dashboard" tradicional. Tres
 * bloques fijos: Hero de Patrimonio Neto, Feed de Decisiones Inteligentes,
 * Consola de Comando Directa. El detalle por cuenta (informacion de consulta,
 * no de decision) vive colapsado por defecto — principio "Cero Ruido".
 */
export default async function ExecutiveBoardPage() {
  const supabase = await getSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const spaces = await getUserSpaces();

  if (spaces.length === 0) {
    return (
      <main className="min-h-screen bg-obsidian px-6 py-10 text-stone-100">
        <div className="mx-auto max-w-md text-center">
          <h1 className="text-xl font-medium">Crea tu primer espacio</h1>
          <p className="mt-2 text-sm text-stone-400">
            Un espacio (Personal, Familiar, Negocio o Proyecto) agrupa tus cuentas y movimientos de forma aislada.
          </p>
          <div className="mt-6 flex justify-center">
            <CreateSpaceDialog />
          </div>
        </div>
      </main>
    );
  }

  const cookieStore = await cookies();
  const cookieSpaceId = cookieStore.get(ACTIVE_SPACE_COOKIE)?.value ?? null;
  const activeSpace = spaces.find((s) => s.id === cookieSpaceId) ?? spaces[0];

  const [balances, pendingTransactions, categories, proactiveInsights, monthlyNetFlow, spaceMembers, recentActivity] =
    await Promise.all([
      getAccountBalances(activeSpace.id),
      getPendingTransactions(activeSpace.id),
      getCategories(activeSpace.id),
      getProactiveInsights(activeSpace.id),
      getMonthlyNetFlow(activeSpace.id),
      getSpaceMembers(activeSpace.id),
      getTransactionHistory(activeSpace.id, 5),
    ]);

  const totalBalance = balances.accounts.reduce((sum, a) => sum + a.currentBalance, 0);

  // Monetizacion asimetrica: la analitica avanzada de negocio (Picos de
  // Venta, Proyeccion de Caja) solo se restringe en espacios type='business'
  // sin is_pro. Personal/Familiar/Proyecto siempre la tienen gratis.
  const businessAnalyticsLocked = activeSpace.type === 'business' && !activeSpace.isPro;
  const [businessCashInsight, cashFlowProjection] = businessAnalyticsLocked
    ? [null, null]
    : await Promise.all([getBusinessCashInsight(activeSpace.id), getCashFlowProjection(activeSpace.id, totalBalance)]);

  return (
    <main className="min-h-screen bg-obsidian text-stone-100">
      <AppNav spaces={spaces} activeSpaceId={activeSpace.id} activePath="executive-board" />

      {/* Espacios colaborativos: sincroniza el tablero en vivo cuando otro
          miembro registra o confirma algo en este mismo espacio. Invisible
          por defecto -- solo aparece un aviso breve cuando de verdad pasa
          algo, nunca un indicador de presencia permanente. */}
      <RealtimeSpaceSync spaceId={activeSpace.id} currentUserId={user.id} members={spaceMembers} />

      <div className="mx-auto flex max-w-5xl flex-col gap-6 px-6 py-8 pb-24 sm:pb-8">
        {/* Modo Fantasma: invita, nunca exige, a guardar el espacio una vez
            que la persona ya lo esta usando -- ver app/page.tsx. */}
        {user.is_anonymous && <SaveSpaceBanner />}

        {/* c) Consola de Comando Directa: arriba y sticky — lo primero que
            se ve, siempre alcanzable, sin depender de scroll ni de que el
            teclado virtual no tape un input fijo abajo. */}
        <CommandConsole spaceId={activeSpace.id} />

        {/* a) Hero de Patrimonio y Proyeccion */}
        <NetWorthHero
          baseCurrency={balances.baseCurrency}
          totalBalance={totalBalance}
          hasRealAssets={balances.hasRealAssets}
          monthlyNetFlow={monthlyNetFlow}
          activityStreakDays={proactiveInsights.activityStreakDays}
        />

        {/* "Concepto y Destino como Protagonistas": nunca solo el numero
            agregado -- justo debajo, los movimientos reales que lo explican. */}
        <RecentActivityCard items={recentActivity} />

        {/* Inteligencia para Microemprendimientos + Proyeccion de Caja:
            solo existen cuando ya hay suficiente historial -- Cero Ruido
            para espacios sin datos todavia. En espacios de Negocio sin Pro,
            un unico upsell reemplaza ambas (nunca bloquea lo basico). */}
        {businessAnalyticsLocked ? (
          <BusinessProUpsell
            spaceId={activeSpace.id}
            canManage={activeSpace.role === 'owner' || activeSpace.role === 'admin'}
          />
        ) : (
          <>
            {businessCashInsight && <BusinessCashCard insight={businessCashInsight} baseCurrency={balances.baseCurrency} />}
            {cashFlowProjection && cashFlowProjection.upcomingEvents.length > 0 && (
              <CashFlowProjectionCard projection={cashFlowProjection} baseCurrency={balances.baseCurrency} />
            )}
          </>
        )}

        {/* b) Feed de Decisiones Inteligentes */}
        <ActionFeed
          spaceId={activeSpace.id}
          baseCurrency={balances.baseCurrency}
          pendingTransactions={pendingTransactions}
          recurringObligations={proactiveInsights.recurringObligations}
          hasActivityToday={proactiveInsights.hasActivityToday}
          accounts={balances.accounts}
          categories={categories}
        />

        {/* Cero Ruido: detalle por cuenta colapsado — es consulta, no decision */}
        <details className="group rounded-xl border border-white/10 bg-elevated open:pb-5 transition-colors hover:border-gold/15">
          <summary className="cursor-pointer list-none px-5 py-4 text-sm font-medium text-stone-300 marker:content-none">
            <span className="inline-flex items-center gap-2">
              Detalle por cuenta
              <span className="text-stone-600 transition-transform group-open:rotate-90">›</span>
            </span>
          </summary>
          <div className="px-5">
            <LazyBalancesGrid baseCurrency={balances.baseCurrency} accounts={balances.accounts} />
          </div>
        </details>
      </div>
    </main>
  );
}
