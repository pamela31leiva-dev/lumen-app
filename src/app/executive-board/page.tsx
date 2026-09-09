import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { getAccountBalances, getCategories, getPendingTransactions, getUserSpaces } from '@/actions/dashboard';
import { getProactiveInsights } from '@/actions/analytics';
import { getSupabaseServerClient } from '@/infrastructure/supabase/server';
import { ACTIVE_SPACE_COOKIE } from '@/lib/constants';
import { AppNav } from '@/components/dashboard/AppNav';
import { CreateSpaceDialog } from '@/components/dashboard/CreateSpaceDialog';
import { NetWorthHero } from '@/components/dashboard/NetWorthHero';
import { ActionFeed } from '@/components/dashboard/ActionFeed';
import { CommandConsole } from '@/components/dashboard/CommandConsole';
import { BalancesGrid } from '@/components/dashboard/BalancesGrid';

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

  const [balances, pendingTransactions, categories, proactiveInsights] = await Promise.all([
    getAccountBalances(activeSpace.id),
    getPendingTransactions(activeSpace.id),
    getCategories(activeSpace.id),
    getProactiveInsights(activeSpace.id),
  ]);

  const totalBalance = balances.accounts.reduce((sum, a) => sum + a.currentBalance, 0);

  return (
    <main className="min-h-screen bg-obsidian text-stone-100">
      <AppNav spaces={spaces} activeSpaceId={activeSpace.id} activePath="executive-board" />

      <div className="mx-auto flex max-w-5xl flex-col gap-6 px-6 py-8 pb-40">
        {/* a) Hero de Patrimonio y Proyeccion */}
        <NetWorthHero baseCurrency={balances.baseCurrency} totalBalance={totalBalance} />

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
            <BalancesGrid baseCurrency={balances.baseCurrency} accounts={balances.accounts} />
          </div>
        </details>

        {/* c) Consola de Comando Directa */}
        <CommandConsole spaceId={activeSpace.id} />
      </div>
    </main>
  );
}
