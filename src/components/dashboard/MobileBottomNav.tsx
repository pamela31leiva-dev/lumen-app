import Link from 'next/link';
import { cn } from '@/lib/utils';

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
    href: '/overview',
    label: 'Global',
    key: 'overview' as const,
    icon: (
      <>
        <rect x="3" y="3" width="7" height="7" rx="1.5" strokeLinecap="round" strokeLinejoin="round" />
        <rect x="14" y="3" width="7" height="7" rx="1.5" strokeLinecap="round" strokeLinejoin="round" />
        <rect x="3" y="14" width="7" height="7" rx="1.5" strokeLinecap="round" strokeLinejoin="round" />
        <rect x="14" y="14" width="7" height="7" rx="1.5" strokeLinecap="round" strokeLinejoin="round" />
      </>
    ),
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
  {
    href: '/privacy',
    label: 'Privacidad',
    key: 'privacy' as const,
    icon: (
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M12 3 4 6v6c0 4.5 3.2 7.7 8 9 4.8-1.3 8-4.5 8-9V6l-8-3Z"
      />
    ),
  },
];

/**
 * Barra inferior fija de navegacion, solo en movil (sm:hidden). Reemplaza
 * los links de texto en el header, que en pantallas angostas desbordaban
 * horizontalmente junto con el selector de espacios y forzaban scroll
 * lateral. Patron estandar de app movil: 3 iconos + etiqueta, siempre
 * alcanzable con el pulgar, sin competir por espacio con nada mas.
 */
export function MobileBottomNav({ activePath }: { activePath: 'executive-board' | 'overview' | 'settings' | 'privacy' }) {
  return (
    <nav className="fixed inset-x-0 bottom-0 z-40 flex border-t border-white/10 bg-elevated/95 backdrop-blur sm:hidden">
      {NAV_ITEMS.map((item) => {
        const isActive = activePath === item.key;
        return (
          <Link
            key={item.key}
            href={item.href}
            className={cn(
              'flex flex-1 flex-col items-center gap-0.5 py-2.5 text-[11px] transition',
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
