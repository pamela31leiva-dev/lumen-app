'use server';

import { getAccountBalances, getMonthlyNetFlow, getUserSpaces } from '@/actions/dashboard';
import type { SpaceType } from '@/domain/types/dashboard';

export interface SpaceOverviewRow {
  spaceId: string;
  name: string;
  type: SpaceType;
  baseCurrency: string;
  totalBalance: number;
  monthlyNetFlow: number;
}

export interface CurrencyTotal {
  currency: string;
  totalBalance: number;
  monthlyNetFlow: number;
}

export interface GlobalOverview {
  spaces: SpaceOverviewRow[];
  /**
   * Un total agregado solo tiene sentido sumando espacios en la MISMA
   * moneda -- nunca se convierte entre monedas (esa tasa es un dato
   * deterministico que no existe todavia, no algo que se deba inventar).
   * Casi siempre habra una sola entrada aqui (todo en COP), pero si algun
   * espacio tiene otra moneda base, se muestra como un grupo aparte.
   */
  totalsByCurrency: CurrencyTotal[];
}

/**
 * "Vista de Panorama Conjunto": un vistazo de hacia donde se mueve el
 * dinero across TODOS los espacios del usuario (Personal, Familiar,
 * Proyectos, Negocio), sin tener que cambiar de espacio uno por uno.
 * Reusa las mismas funciones deterministicas ya probadas de cada espacio
 * individual (getAccountBalances, getMonthlyNetFlow) -- nada nuevo que
 * calcular, solo agregarlo en una sola pantalla.
 */
export async function getGlobalOverview(): Promise<GlobalOverview> {
  const spaces = await getUserSpaces();

  const rows = await Promise.all(
    spaces.map(async (space): Promise<SpaceOverviewRow> => {
      const [balances, monthlyNetFlow] = await Promise.all([
        getAccountBalances(space.id),
        getMonthlyNetFlow(space.id),
      ]);
      const totalBalance = balances.accounts.reduce((sum, a) => sum + a.currentBalance, 0);

      return {
        spaceId: space.id,
        name: space.name,
        type: space.type,
        baseCurrency: space.baseCurrency,
        totalBalance,
        monthlyNetFlow,
      };
    }),
  );

  const totalsMap = new Map<string, CurrencyTotal>();
  for (const row of rows) {
    const current = totalsMap.get(row.baseCurrency) ?? {
      currency: row.baseCurrency,
      totalBalance: 0,
      monthlyNetFlow: 0,
    };
    current.totalBalance += row.totalBalance;
    current.monthlyNetFlow += row.monthlyNetFlow;
    totalsMap.set(row.baseCurrency, current);
  }

  return { spaces: rows, totalsByCurrency: Array.from(totalsMap.values()) };
}
