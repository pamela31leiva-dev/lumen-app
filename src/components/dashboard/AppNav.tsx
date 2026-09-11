import Link from 'next/link';
import { SpaceSwitcher } from '@/components/dashboard/SpaceSwitcher';
import { PrivacyCenterModal } from '@/components/dashboard/PrivacyCenterModal';
import { MobileBottomNav } from '@/components/dashboard/MobileBottomNav';
import type { SpaceSummary } from '@/domain/types/dashboard';
import { cn } from '@/lib/utils';

const NAV_LINKS = [
  { href: '/executive-board', label: 'Panorama', key: 'executive-board' as const },
  { href: '/overview', label: 'Panorama Conjunto', key: 'overview' as const },
  { href: '/settings', label: 'Ajustes', key: 'settings' as const },
  { href: '/privacy', label: 'Privacidad', key: 'privacy' as const },
];

interface AppNavProps {
  spaces: SpaceSummary[];
  activeSpaceId: string;
  activePath: 'executive-board' | 'overview' | 'settings' | 'privacy';
}

/** Encabezado compartido por /executive-board, /settings y /privacy. */
export function AppNav({ spaces, activeSpaceId, activePath }: AppNavProps) {
  return (
    <>
      <header className="overflow-x-hidden border-b border-white/10 px-4 py-4 sm:px-6">
        <div className="mx-auto flex max-w-5xl flex-wrap items-center justify-between gap-3">
          {/* En movil, esta lista se reemplaza por MobileBottomNav (barra
              inferior fija) -- eran estos links, sumados al selector de
              espacios, los que desbordaban horizontalmente en pantallas
              angostas. */}
          <nav className="hidden items-center gap-4 sm:flex">
            {NAV_LINKS.map((link) => (
              <Link
                key={link.key}
                href={link.href}
                className={cn(
                  'text-sm transition',
                  activePath === link.key ? 'font-medium text-emerald-400' : 'text-stone-400 hover:text-stone-200',
                )}
              >
                {link.label}
              </Link>
            ))}
          </nav>
          <div className="flex min-w-0 flex-1 items-center gap-2 sm:flex-none sm:gap-3">
            <SpaceSwitcher spaces={spaces} activeSpaceId={activeSpaceId} />
            {/* Centro de Privacidad queda solo en desktop: en movil, el
                link "Privacidad" de la barra inferior ya cubre el acceso
                (misma informacion, pantalla completa en vez de modal). */}
            <div className="hidden sm:block">
              <PrivacyCenterModal />
            </div>
          </div>
        </div>
      </header>
      <MobileBottomNav activePath={activePath} />
    </>
  );
}
