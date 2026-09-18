import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { getUserSpaces } from '@/actions/dashboard';
import { getExecutiveBoardSnapshot } from '@/actions/snapshot';
import { getFailedCaptures } from '@/actions/ingestion';
import { getFinancialHistory } from '@/actions/analytics-history';
import { getFiscalSummary } from '@/actions/fiscal';
import { checkSpaceIsPro } from '@/actions/plan-limits';
import { LumenGuideTip } from '@/components/guide/LumenGuideTip';
import { GUIDE_MESSAGES } from '@/domain/guide/messages';
import { computeFinancialKpis, resampleQuarterly } from '@/domain/analytics/kpis';
import { canEditSpace, canManageSpace } from '@/domain/permissions';
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
import { HistoricalPanoramaCard } from '@/components/dashboard/HistoricalPanoramaCard';
import { RecurringIncomesCard } from '@/components/dashboard/RecurringIncomesCard';
import { RadiografiaCard } from '@/components/dashboard/RadiografiaCard';
import { AnomalyAuditCard } from '@/components/dashboard/AnomalyAuditCard';
import { FinancialKpisCard } from '@/components/dashboard/FinancialKpisCard';
import { FinancialHistoryCard } from '@/components/dashboard/FinancialHistoryCard';
import { MonthlyReportModal } from '@/components/dashboard/MonthlyReportModal';
import { FiscalSummaryCard } from '@/components/dashboard/FiscalSummaryCard';

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
      <main className="min-h-screen bg-page px-6 py-10 text-stone-100">
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

  // Monetizacion asimetrica: la analitica avanzada de negocio (Picos de
  // Venta, Proyeccion de Caja) solo se restringe en espacios type='business'
  // sin Pro. Personal/Familiar/Proyecto siempre la tienen gratis.
  //
  // Fuente unica de verdad (Bloque P9): checkSpaceIsPro unifica
  // spaces.is_pro (bandera manual/simulacion) con subscriptions.plan (pago
  // real del dueño) -- ver get_space_plan_limits (0036). Nunca leer
  // activeSpace.isPro directo para decidir un bloqueo.
  const isSpacePro = await checkSpaceIsPro(activeSpace.id);
  const businessAnalyticsLocked = activeSpace.type === 'business' && !isSpacePro;

  // RBAC (Bloque P4): mismo umbral que las politicas RLS (has_space_role) --
  // canEdit habilita capturar/confirmar/importar (owner/admin/editor);
  // canManage habilita administracion del espacio (owner/admin). Un Visor no
  // cumple ninguno de los dos.
  const canEdit = canEditSpace(activeSpace.role);
  const canManage = canManageSpace(activeSpace.role);

  // Snapshot Unico (0018): un solo round-trip a Postgres (get_executive_board_snapshot)
  // reemplaza los 9+ round-trips paralelos que antes armaban este tablero.
  const {
    totalBalance,
    balances,
    pendingTransactions,
    categories,
    spaceMembers,
    recentActivity,
    bills,
    monthlyNetFlow,
    yearlyOverview,
    proactiveInsights,
    businessCashInsight,
    cashFlowProjection,
    recurringIncomes,
    folderDistribution,
    weekdayHeat,
    anomalies,
  } = await getExecutiveBoardSnapshot(activeSpace.id, businessAnalyticsLocked, isSpacePro);

  // Centro de Ingesta: entradas que ni Gemini ni el motor local pudieron
  // interpretar (ver adapter.ts + actions/capture.ts). Consulta aparte y
  // liviana -- se espera que este casi siempre vacia, asi que no vale la
  // pena cargar el snapshot atomico con esto.
  //
  // Historia Financiera (0028): tampoco vive en el snapshot atomico -- cambia
  // con frecuencia distinta (mes a mes, no en cada captura) y no todas las
  // pantallas la necesitan. Se piden ambas en paralelo.
  const [failedCaptures, financialHistory, fiscalSummary] = await Promise.all([
    getFailedCaptures(activeSpace.id),
    getFinancialHistory(activeSpace.id),
    getFiscalSummary(activeSpace.id),
  ]);
  const financialKpis = computeFinancialKpis(financialHistory);
  const financialHistoryQuarterly = resampleQuarterly(financialHistory);

  return (
    <main className="min-h-screen bg-page text-stone-100">
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
        <CommandConsole spaceId={activeSpace.id} canEdit={canEdit} />

        {/* a) Hero de Patrimonio y Proyeccion */}
        <NetWorthHero
          baseCurrency={balances.baseCurrency}
          totalBalance={totalBalance}
          hasRealAssets={balances.hasRealAssets}
          monthlyNetFlow={monthlyNetFlow}
          activityStreakDays={proactiveInsights.activityStreakDays}
        />

        {/* Lumen Guide (Fase 1 -- identidad y asistente de marca): el
            momento de mas friccion real de todo el tablero es "por que mi
            Patrimonio Neto sigue en $0" -- un acompañamiento breve aqui vale
            mas que en cualquier otra pantalla. */}
        {!balances.hasRealAssets && <LumenGuideTip {...GUIDE_MESSAGES.netWorthEmpty} />}

        {/* KPIs Financieros + Reporte Mensual (Bloque P3): solo tiene sentido
            leer tasa de ahorro/liquidez/endeudamiento cuando ya hay
            "Patrimonio Neto" real (mismo criterio que NetWorthHero) -- antes
            de eso todo saldria en cero o negativo por falta de dato inicial,
            no por una senal financiera real. */}
        {balances.hasRealAssets && (
          <>
            <FinancialKpisCard kpis={financialKpis} />
            <div className="flex items-center justify-end">
              <MonthlyReportModal spaceId={activeSpace.id} baseCurrency={balances.baseCurrency} />
            </div>
            <FinancialHistoryCard monthly={financialHistory} quarterly={financialHistoryQuarterly} baseCurrency={balances.baseCurrency} />
          </>
        )}

        {/* Resumen Fiscal (Bloque P5, Colombia): suma lo que la persona ya
            clasifico como gravado/exento/deducible -- nunca calcula impuesto.
            Siempre visible (no depende de "Patrimonio Neto" real) porque
            aplica igual a un espacio que recien empieza a registrar ingresos. */}
        <FiscalSummaryCard spaceId={activeSpace.id} baseCurrency={balances.baseCurrency} initialSummary={fiscalSummary} />

        {/* Radiografia Proporcional: entendimiento en 3 segundos -- barra
            segmentada por carpeta + mapa de calor semanal, en vez de exigir
            leer una lista para entender donde se fue la plata. */}
        <RadiografiaCard folderDistribution={folderDistribution} weekdayHeat={weekdayHeat} baseCurrency={balances.baseCurrency} />

        {/* "Concepto y Destino como Protagonistas": nunca solo el numero
            agregado -- justo debajo, los movimientos reales que lo explican. */}
        <RecentActivityCard items={recentActivity} />

        {/* Auditoria de Anomalias -- nivel avanzado (is_pro): gastos muy
            fuera de lo normal de su propia categoria, calculado siempre en
            Postgres pero mostrado solo si el espacio tiene acceso avanzado. */}
        {isSpacePro && <AnomalyAuditCard anomalies={anomalies} baseCurrency={balances.baseCurrency} />}

        {/* Inteligencia para Microemprendimientos + Proyeccion de Caja:
            solo existen cuando ya hay suficiente historial -- Cero Ruido
            para espacios sin datos todavia. En espacios de Negocio sin Pro,
            un unico upsell reemplaza ambas (nunca bloquea lo basico). */}
        {businessAnalyticsLocked ? (
          <BusinessProUpsell spaceId={activeSpace.id} canManage={canManage} />
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
          bills={bills}
          billReminderDays={activeSpace.billReminderDays}
          failedCaptures={failedCaptures}
          canEdit={canEdit}
        />

        {/* Cero Ruido: detalle por cuenta colapsado — es consulta, no decision */}
        <details className="card-surface group rounded-xl border border-white/10 bg-elevated open:pb-5 transition-colors hover:border-gold/15">
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

        {/* "Selector Temporal e Historico": comparar años completos, solo si
            hay 2+ años de datos -- comparar contra un solo año no es una
            comparacion. Colapsado por defecto, igual que Detalle por cuenta. */}
        {yearlyOverview.length >= 2 && (
          <HistoricalPanoramaCard years={yearlyOverview} baseCurrency={balances.baseCurrency} />
        )}

        {/* Ingresos Recurrentes con Ajuste Anual (0019): pension, salario u
            otro flujo fijo, registrado una vez -- Lumen lo proyecta solo mes
            a mes (ver generate_due_recurring_incomes). */}
        <RecurringIncomesCard
          spaceId={activeSpace.id}
          baseCurrency={balances.baseCurrency}
          recurringIncomes={recurringIncomes}
          canEdit={canEdit}
          canManage={canManage}
        />
      </div>
    </main>
  );
}
