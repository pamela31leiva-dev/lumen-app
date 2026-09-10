import type { SpaceType } from '@/domain/types/dashboard';

export const SPACE_TYPE_LABEL: Record<SpaceType, string> = {
  personal: 'Personal',
  family: 'Familiar',
  business: 'Negocio',
  project: 'Proyecto',
};

/** Un icono de linea por tipo de espacio — misma familia visual que el boton de microfono/camara de la Consola de Comando. Compartido entre SpaceSwitcher y CreateSpaceDialog. */
export function SpaceTypeIcon({ type, className }: { type: SpaceType; className?: string }) {
  const common = { viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 1.75, className };
  switch (type) {
    case 'personal':
      return (
        <svg {...common}>
          <circle cx="12" cy="8" r="3.5" strokeLinecap="round" strokeLinejoin="round" />
          <path strokeLinecap="round" strokeLinejoin="round" d="M5 20c0-3.5 3.13-6 7-6s7 2.5 7 6" />
        </svg>
      );
    case 'family':
      return (
        <svg {...common}>
          <circle cx="8.5" cy="8" r="2.75" strokeLinecap="round" strokeLinejoin="round" />
          <circle cx="15.5" cy="8" r="2.75" strokeLinecap="round" strokeLinejoin="round" />
          <path strokeLinecap="round" strokeLinejoin="round" d="M3 19c0-2.8 2.46-4.75 5.5-4.75S14 16.2 14 19M12.5 14.4c.8-.7 1.87-1.15 3-1.15 3.04 0 5.5 1.95 5.5 4.75" />
        </svg>
      );
    case 'business':
      return (
        <svg {...common}>
          <rect x="3" y="8" width="18" height="12" rx="1.5" strokeLinecap="round" strokeLinejoin="round" />
          <path strokeLinecap="round" strokeLinejoin="round" d="M8 8V6a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2M3 13h18" />
        </svg>
      );
    case 'project':
      return (
        <svg {...common}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M5 3v18" />
          <path strokeLinecap="round" strokeLinejoin="round" d="M5 4h11l-2.2 3.5L16 11H5" />
        </svg>
      );
  }
}
