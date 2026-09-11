import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { getUserSpaces } from '@/actions/dashboard';
import { getGlobalOverview } from '@/actions/overview';
import { getSupabaseServerClient } from '@/infrastructure/supabase/server';
import { ACTIVE_SPACE_COOKIE } from '@/lib/constants';
import { AppNav } from '@/components/dashboard/AppNav';
import { SPACE_TYPE_LABEL, SpaceTypeIcon } from '@/components/dashboard/space-type-icon';
import { cn, formatMoney } from '@/lib/utils';

/**
 * "Vista de Panorama Conjunto": hacia donde se mueve el dinero across TODOS
 * los espacios del usuario, de un vistazo -- sin tener que entrar uno por
 * uno. Ambar (nunca rojo) cuando un espacio va en contra este mes, mismo
 * lenguaje visual que el resto de la app. Los totales solo se suman entre
 * espacios de la MISMA moneda -- nunca se inventa una conversion.
 */
export default async function OverviewPage() {
  const supabase = await getSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const spaces = await getUserSpaces();
  if (spaces.length === 0) redirect('/executive-board');

  const cookieStore = await cookies();
  const cookieSpaceId = cookieStore.get(ACTIVE_SPACE_COOKIE)?.value ?? null;
  const activeSpace = spaces.find((s) => s.id === cookieSpaceId) ?? spaces[0];

  const overview = await getGlobalOverview();

  return (
    <main className="min-h-screen bg-obsidian text-stone-100">
      <AppNav spaces={spaces} activeSpaceId={activeSpace.id} activePath="overview" />

      <div className="mx-auto flex max-w-5xl flex-col gap-6 px-6 py-8 pb-24 sm:pb-8">
        <div>
          <h1 className="text-xl font-medium">Panorama Conjunto</h1>
          <p className="mt-1 text-sm text-stone-500">Hacia donde se mueve tu dinero en todos tus espacios, de un vistazo.</p>
        </div>

        {overview.totalsByCurrency.length > 0 && (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            {overview.totalsByCurrency.map((total) => (
              <section
                key={total.currency}
                className="rounded-xl border border-white/10 bg-elevated p-6 transition-colors hover:border-gold/15"
              >
                <p className="text-[11px] font-medium uppercase tracking-[0.2em] text-stone-500">
                  Total consolidado · {total.currency}
                </p>
                <p className="amount mt-2 text-3xl font-bold text-stone-50">
                  {formatMoney(total.totalBalance, total.currency)}
                </p>
                <p
                  className={cn(
                    'amount mt-1 text-sm',
                    total.monthlyNetFlow < 0 ? 'text-amber-300' : 'text-stone-400',
                  )}
                >
                  {formatMoney(total.monthlyNetFlow, total.currency)} este mes
                </p>
              </section>
            ))}
          </div>
        )}

        <section className="rounded-xl border border-white/10 bg-elevated">
          <div className="px-5 py-4">
            <h2 className="text-sm font-medium text-stone-200">Por espacio</h2>
          </div>
          <ul className="flex flex-col divide-y divide-white/10">
            {overview.spaces.map((space) => (
              <li key={space.spaceId} className="flex items-center justify-between gap-3 px-5 py-4">
                <div className="flex min-w-0 items-center gap-3">
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-white/5 text-stone-400">
                    <SpaceTypeIcon type={space.type} className="h-4 w-4" />
                  </span>
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-stone-100">{space.name}</p>
                    <p className="text-xs text-stone-500">{SPACE_TYPE_LABEL[space.type]}</p>
                  </div>
                </div>
                <div className="shrink-0 text-right">
                  <p className="amount text-sm font-medium text-stone-100">{formatMoney(space.totalBalance, space.baseCurrency)}</p>
                  <p className={cn('amount text-xs', space.monthlyNetFlow < 0 ? 'text-amber-300' : 'text-stone-500')}>
                    {formatMoney(space.monthlyNetFlow, space.baseCurrency)} este mes
                  </p>
                </div>
              </li>
            ))}
          </ul>
        </section>
      </div>
    </main>
  );
}
