'use client';

import dynamic from 'next/dynamic';
import type { AccountBalance } from '@/domain/types/dashboard';

// "Detalle por cuenta" vive colapsado por defecto (Cero Ruido) en el
// Executive Action Board -- su JS (useState/useTransition, la accion de
// editar saldo inicial) no tiene por que formar parte del bundle inicial de
// la pantalla principal. ssr:false es seguro aqui precisamente porque el
// <details> que lo envuelve ya esta cerrado: no hay contenido visible que
// perder mientras carga. Mismo patron que BulkImportModal en CommandConsole.
const BalancesGrid = dynamic(() => import('@/components/dashboard/BalancesGrid').then((mod) => mod.BalancesGrid), {
  ssr: false,
  loading: () => <p className="text-sm text-stone-500">Cargando...</p>,
});

interface LazyBalancesGridProps {
  baseCurrency: string;
  accounts: AccountBalance[];
}

export function LazyBalancesGrid(props: LazyBalancesGridProps) {
  return <BalancesGrid {...props} />;
}
