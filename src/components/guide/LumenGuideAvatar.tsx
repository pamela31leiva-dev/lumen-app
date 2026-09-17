/**
 * Identidad visual de "Lumen Guide" -- la mascota/asistente de marca (Fase 1
 * del plan de mejora). El nombre "Lumen" es luz en latin, asi que el
 * personaje ES literalmente eso: un pequeño resplandor calido con cara,
 * nunca un dibujo animado completo -- coherente con el resto del sistema
 * visual (iconos de linea, paleta gold/growth/wealth sobre fondo oscuro,
 * "banca privada de alto nivel" en vez de un tono infantil). El brillo de
 * fondo (blur) es lo que le da personalidad sin necesitar ilustracion
 * detallada: el mismo truco que ya usa el destello dorado del Hero de
 * balance al confirmar un movimiento (ver lib/clarity-loop.ts).
 */
export type LumenGuideMood = 'default' | 'happy' | 'thinking' | 'celebrating';

interface LumenGuideAvatarProps {
  mood?: LumenGuideMood;
  /** Lado del cuadrado en px -- el SVG es 1:1, se escala entero. */
  size?: number;
  className?: string;
}

/** Ojos y boca por estado de animo -- misma cara base, solo cambian estos trazos. */
function FaceByMood({ mood }: { mood: LumenGuideMood }) {
  switch (mood) {
    case 'happy':
      return (
        <>
          <path d="M17 21c1 1.2 2.2 1.2 3 0" strokeLinecap="round" />
          <path d="M28 21c.8 1.2 2 1.2 3 0" strokeLinecap="round" />
          <path d="M16.5 26c2 2.6 9 2.6 11 0" strokeLinecap="round" strokeLinejoin="round" />
        </>
      );
    case 'thinking':
      return (
        <>
          <circle cx="18.5" cy="21.5" r="1.4" fill="currentColor" stroke="none" />
          <circle cx="29.5" cy="20" r="1.4" fill="currentColor" stroke="none" />
          <path d="M25 15.5c1.6-1 3.4-1.2 5-.5" strokeLinecap="round" />
          <path d="M18 27c2.5-1.4 5.5-1.4 8 0" strokeLinecap="round" />
        </>
      );
    case 'celebrating':
      return (
        <>
          <path d="M16.5 20.5c1.2 1.6 2.8 1.6 4 0" strokeLinecap="round" />
          <path d="M27.5 20.5c1.2 1.6 2.8 1.6 4 0" strokeLinecap="round" />
          <path d="M16 25.5c2.4 3 9.6 3 12 0" strokeLinecap="round" strokeLinejoin="round" />
        </>
      );
    default:
      return (
        <>
          <circle cx="18.5" cy="21" r="1.4" fill="currentColor" stroke="none" />
          <circle cx="29.5" cy="21" r="1.4" fill="currentColor" stroke="none" />
          <path d="M18.5 27c2.3 1.8 7.7 1.8 10 0" strokeLinecap="round" strokeLinejoin="round" />
        </>
      );
  }
}

export function LumenGuideAvatar({ mood = 'default', size = 40, className }: LumenGuideAvatarProps) {
  const gradientId = `lumen-guide-glow-${mood}`;
  return (
    <svg width={size} height={size} viewBox="0 0 48 48" fill="none" className={className} aria-hidden="true">
      <defs>
        <radialGradient id={gradientId} cx="38%" cy="32%" r="75%">
          <stop offset="0%" stopColor="#F6E7B4" />
          <stop offset="55%" stopColor="#D4AF37" />
          <stop offset="100%" stopColor="#9C7A1E" />
        </radialGradient>
      </defs>
      {/* Halo -- el "brillo" que hace que sea Lumen y no cualquier circulo. */}
      <circle cx="24" cy="23" r="19" fill="#D4AF37" opacity="0.22" style={{ filter: 'blur(6px)' }} />
      <circle cx="24" cy="23" r="15.5" fill={`url(#${gradientId})`} />
      {mood === 'celebrating' && (
        <g stroke="#F6E7B4" strokeWidth="1.6" strokeLinecap="round" opacity="0.9">
          <path d="M8 12l2.2 2.2" />
          <path d="M40 12l-2.2 2.2" />
          <path d="M8 30l2.2-2.2" />
          <path d="M40 30l-2.2-2.2" />
        </g>
      )}
      <g stroke="#3A2B06" strokeWidth="1.8">
        <FaceByMood mood={mood} />
      </g>
    </svg>
  );
}
