import Link from 'next/link';
import { SpaceSwitcher } from '@/components/dashboard/SpaceSwitcher';
import { PrivacyCenterModal } from '@/components/dashboard/PrivacyCenterModal';
import type { SpaceSummary } from '@/domain/types/dashboard';
import { cn } from '@/lib/utils';

const NAV_LINKS = [
  { href: '/executive-board', label: 'Panorama', key: 'executive-board' as const },
  { href: '/settings', label: 'Ajustes', key: 'settings' as const },
  { href: '/privacy', label: 'Privacidad', key: 'privacy' as const },
];

interface AppNavProps {
  spaces: SpaceSummary[];
  activeSpaceId: string;
  activePath: 'executive-board' | 'settings' | 'privacy';
}

/** Encabezado compartido por /executive-board, /settings y /privacy. */
export function AppNav({ spaces, activeSpaceId, activePath }: AppNavProps) {
  return (
    <header className="border-b border-white/10 px-6 py-4">
      <div className="mx-auto flex max-w-5xl flex-wrap items-center justify-between gap-3">
        <nav className="flex items-center gap-4">
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
        <div className="flex items-center gap-3">
          <SpaceSwitcher spaces={spaces} activeSpaceId={activeSpaceId} />
          <PrivacyCenterModal />
        </div>
      </div>
    </header>
  );
}
