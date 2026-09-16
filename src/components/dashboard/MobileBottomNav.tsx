import Link from 'next/link';
import { cn } from '@/lib/utils';
import type { AppNavPath } from '@/components/dashboard/AppNav';

const NAV_ITEMS = [
  {
    href: '/executive-board',
    label: 'Panorama',
    key: 'executive-board' as const,
    icon: (
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M4 12 12 4l8 8M6 10v9a1 1 0 0 0 1 1h3v-5h4v5h3a1 1 0 0 0 1-1v-9"
      />
    ),
  },
  {
    // Ancla al mismo id="quick-capture" de CommandConsole (ver
    // executive-board/page.tsx) -- no es una pagina nueva, es el atajo de
    // una mano al input de captura, siempre arriba de esa pantalla. Nunca
    // se marca "activo": es una accion, no un destino propio.
    href: '/executive-board#quick-capture',
    label: 'Captura',
    key: 'captura' as const,
    icon: (
      <>
        <circle cx="12" cy="12" r="9" strokeLinecap="round" strokeLinejoin="round" />
        <path strokeLinecap="round" strokeLinejoin="round" d="M12 8v8M8 12h8" />
      </>
    ),
  },
  {
    href: '/movimientos',
    label: 'Movimientos',
    key: 'movimientos' as const,
    icon: <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 12h16M4 18h10" />,
  },
  {
    href: '/settings',
    label: 'Ajustes',
    key: 'settings' as const,
    icon: (
      <>
        <circle cx="12" cy="12" r="3" strokeLinecap="round" strokeLinejoin="round" />
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          d="M19.4 13a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V19a2 2 0 1 1-4 0v-.09a1.65 1.65 0 0 0-1-1.51 1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H4a2 2 0 1 1 0-4h.09a1.65 1.65 0 0 0 1.51-1 1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H10a1.65 1.65 0 0 0 1-1.51V4a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V10a1.65 1.65 0 0 0 1.51 1H20a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1Z"
        />
      </>
    ),
  },
];

/**
 * Barra inferior fija de navegacion, solo en movil (sm:hidden) -- las 4
 * secciones de acceso con una sola mano: Panorama, Captura (atajo al
 * input de CommandConsole), Movimientos, Ajustes. "Panorama Conjunto" y
 * "Privacidad" siguen alcanzables desde Ajustes (ver enlaces al inicio de
 * esa pagina) para no competir por espacio en la barra principal -- 4
 * items es el maximo comodo para el pulgar sin que cada boton se vuelva
 * angosto.
 *
 * pb-[env(safe-area-inset-bottom)] respeta la barra de gestos/home
 * indicator de iPhones con notch -- sin esto, el ultimo renglon de iconos
 * queda pegado (o parcialmente tapado) por esa franja del sistema.
 */
export function MobileBottomNav({ activePath }: { activePath: AppNavPath }) {
  return (
    <nav
      className="fixed inset-x-0 bottom-0 z-40 flex border-t border-white/10 bg-elevated/95 pb-[env(safe-area-inset-bottom)] backdrop-blur sm:hidden"
      style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
    >
      {NAV_ITEMS.map((item) => {
        const isActive = activePath === item.key;
        return (
          <Link
            key={item.key}
            href={item.href}
            className={cn(
              'flex min-h-[48px] flex-1 flex-col items-center justify-center gap-0.5 py-2.5 text-[11px] transition active:bg-white/5',
              isActive ? 'text-emerald-400' : 'text-stone-500 hover:text-stone-300',
            )}
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75} className="h-5 w-5">
              {item.icon}
            </svg>
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}
