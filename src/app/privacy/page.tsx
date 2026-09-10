import { requireActiveSpace } from '@/lib/active-space';
import { AppNav } from '@/components/dashboard/AppNav';
import { PrivacyCenterPanel } from '@/components/dashboard/PrivacyCenterPanel';
import { AppFooter } from '@/components/AppFooter';

const SUPPORT_EMAIL = process.env.NEXT_PUBLIC_SUPPORT_EMAIL;

const RIGHTS = [
  { title: 'Acceso', description: 'Conocer que datos tuyos guardamos y para que los usamos.' },
  { title: 'Actualizacion y rectificacion', description: 'Corregir datos tuyos que esten desactualizados o sean inexactos.' },
  { title: 'Supresion', description: 'Pedir que eliminemos tus datos cuando ya no exista un deber legal de conservarlos.' },
  { title: 'Revocacion del consentimiento', description: 'Retirar en cualquier momento la autorizacion que nos diste para tratar tus datos.' },
];

export default async function PrivacyPage() {
  const { spaces, activeSpace } = await requireActiveSpace();

  return (
    <main className="min-h-screen bg-obsidian text-stone-100">
      <AppNav spaces={spaces} activeSpaceId={activeSpace.id} activePath="privacy" />

      <div className="mx-auto flex max-w-3xl flex-col gap-6 px-6 py-8 pb-24 sm:pb-8">
        <div>
          <h1 className="text-xl font-medium">Centro de Privacidad &amp; Habeas Data</h1>
          <p className="mt-2 text-sm text-stone-400">
            Politica de Tratamiento de Datos Personales de <span className="text-gold">Lumen</span>, responsable del
            tratamiento de tus datos conforme a la Ley 1581 de 2012 y el Decreto 1377 de 2013 (Colombia).
          </p>
        </div>

        <section className="rounded-xl border border-white/10 bg-elevated p-5">
          <h2 className="mb-3 text-sm font-medium text-stone-200">Tus derechos</h2>
          <dl className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            {RIGHTS.map((right) => (
              <div key={right.title}>
                <dt className="text-sm font-medium text-growth">{right.title}</dt>
                <dd className="mt-1 text-xs text-stone-500">{right.description}</dd>
              </div>
            ))}
          </dl>
        </section>

        <section className="rounded-xl border border-white/10 bg-elevated p-5">
          <h2 className="mb-3 text-sm font-medium text-stone-200">Que datos tratamos y para que</h2>
          <ul className="list-disc space-y-2 pl-5 text-sm text-stone-400">
            <li>Datos de cuenta (correo, nombre) para identificarte y administrar tu acceso.</li>
            <li>
              El texto, voz o imagenes que capturas para registrar un movimiento, unicamente para interpretarlos y
              proponerte una transaccion que tu confirmas o corriges.
            </li>
            <li>Tus cuentas, categorias, movimientos y documentos, para mostrarte tu propio patrimonio.</li>
            <li>Bitacora de auditoria de cambios, para trazabilidad y seguridad de tu propia informacion.</li>
          </ul>
        </section>

        <section className="rounded-xl border border-white/10 bg-elevated p-5">
          <h2 className="mb-3 text-sm font-medium text-stone-200">Uso de inteligencia artificial</h2>
          <p className="text-sm text-stone-400">
            Para interpretar texto, voz e imagenes, Lumen envia el contenido que capturas a proveedores de
            inteligencia artificial externos (por ejemplo, Anthropic, Google u OpenAI), quienes lo procesan
            unicamente para generar la interpretacion solicitada, conforme a sus propias politicas de privacidad y
            retencion de datos. Antes de ese envio, buscamos minimizar la informacion personal incluida siempre que
            sea razonablemente posible. Ninguna cifra generada por este proceso se considera definitiva: siempre
            queda en estado pendiente hasta que tu la confirmes o corrijas.
          </p>
        </section>

        <section className="rounded-xl border border-amber-500/20 bg-amber-500/[0.04] p-5">
          <h2 className="mb-3 text-sm font-medium text-stone-200">Alcance de la informacion</h2>
          <p className="text-sm text-stone-400">
            Lumen es una herramienta de organizacion personal de caracter informativo y descriptivo. No constituye
            asesoria financiera, contable, tributaria ni de inversion, y ninguna cifra, categorizacion o sugerencia
            generada por el motor de inteligencia artificial o el motor de patrones tiene caracter vinculante. Las
            decisiones financieras, fiscales o de inversion que tomes son tu responsabilidad y, cuando corresponda,
            deben apoyarse en la validacion de un profesional idoneo.
          </p>
        </section>

        <section className="rounded-xl border border-white/10 bg-elevated p-5">
          <h2 className="mb-4 text-sm font-medium text-stone-200">Ejercer tus derechos</h2>
          <PrivacyCenterPanel />
          {SUPPORT_EMAIL && (
            <p className="mt-4 text-xs text-stone-500">
              Tambien puedes escribirnos directamente a{' '}
              <a href={`mailto:${SUPPORT_EMAIL}`} className="text-gold hover:underline">
                {SUPPORT_EMAIL}
              </a>
              .
            </p>
          )}
        </section>
      </div>
      <AppFooter />
    </main>
  );
}
