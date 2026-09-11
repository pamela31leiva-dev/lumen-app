/**
 * Monetizacion asimetrica: el uso Personal es gratis e ilimitado siempre;
 * solo los espacios type='business' sin is_pro ven esto en vez de Picos de
 * Venta / Proyeccion de Caja / exportacion para contadores. Sin pasarela de
 * pago conectada todavia (activacion manual, igual que subscriptions.sql),
 * asi que el CTA es honesto: pide contacto, no simula un boton de compra
 * que no lleva a ningun lado. Tono informativo, nunca de bloqueo o castigo.
 */
export function BusinessProUpsell() {
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
    </section>
  );
}
