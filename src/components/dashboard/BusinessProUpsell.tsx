'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { activateProSimulation } from '@/actions/billing';

interface BusinessProUpsellProps {
  spaceId: string;
  canManage: boolean;
}

/**
 * Monetizacion asimetrica: el uso Personal es gratis e ilimitado siempre;
 * solo los espacios type='business' sin is_pro ven esto en vez de Picos de
 * Venta / Proyeccion de Caja / exportacion para contadores. Sin pasarela de
 * pago conectada todavia (activacion manual, igual que subscriptions.sql).
 *
 * El boton "Activar Pro (Simulacion)" es explicitamente un modo de prueba
 * interno -- deja el campo is_pro en true sin ningun cobro real, para poder
 * explorar las capacidades avanzadas durante esta fase. Se rotula como tal
 * a proposito, para no aparentar ser un flujo de compra real.
 */
export function BusinessProUpsell({ spaceId, canManage }: BusinessProUpsellProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function handleActivate() {
    setError(null);
    startTransition(async () => {
      const result = await activateProSimulation(spaceId);
      if (!result.success) {
        setError(result.error);
        return;
      }
      router.refresh();
    });
  }

  return (
    <section className="rounded-xl border border-white/10 bg-elevated p-5 transition-colors hover:border-gold/15">
      <p className="text-[11px] font-medium uppercase tracking-[0.2em] text-stone-500">Inteligencia de Negocio</p>
      <p className="mt-2 text-sm text-stone-300">
        Picos de venta, proyeccion de caja y reportes para tu contador estan disponibles con Lumen Pro para espacios de
        Negocio.
      </p>
      <p className="mt-2 text-xs text-stone-500">
        Registrar, confirmar y consultar tus saldos en este espacio sigue siendo gratis sin limite.
      </p>

      {canManage && (
        <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-white/10 pt-3">
          <button
            type="button"
            onClick={handleActivate}
            disabled={isPending}
            className="rounded-lg border border-gold/30 bg-gold-soft px-3 py-1.5 text-xs font-medium text-gold transition hover:bg-gold/20 disabled:opacity-50"
          >
            {isPending ? 'Activando...' : 'Activar Pro (Simulacion)'}
          </button>
          <span className="text-[11px] text-stone-600">Modo de demostracion -- sin cobro real todavia.</span>
        </div>
      )}
      {error && <p className="mt-2 text-xs text-red-400">{error}</p>}
    </section>
  );
}
