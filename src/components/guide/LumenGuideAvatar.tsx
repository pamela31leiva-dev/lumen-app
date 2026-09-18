/**
 * Identidad visual de "Lumen Guide" -- la mascota/asistente de marca. El
 * nombre "Lumen" es luz en latin, asi que la marca es un isotipo de
 * resplandor geometrico (un destello de cuatro puntas mas un acompañante
 * pequeño, como una gema o un brillo de joyeria), nunca un rostro -- una
 * cara sobre un circulo dorado termina leyendose como un emoji basico, lo
 * opuesto a la identidad de banca privada de alto nivel que el resto del
 * sistema visual ya tiene (iconos de linea finos, paleta gold/growth/
 * wealth). El halo de fondo (blur) es lo que le da calidez sin necesitar
 * ilustracion detallada -- mismo recurso que el destello del Hero de
 * balance al confirmar un movimiento (ver lib/clarity-loop.ts).
 */
export type LumenGuideMood = 'default' | 'happy' | 'thinking' | 'celebrating';

interface LumenGuideAvatarProps {
  mood?: LumenGuideMood;
  /** Lado del cuadrado en px -- el SVG es 1:1, se escala entero. */
  size?: number;
  className?: string;
}

export function LumenGuideAvatar({ mood = 'default', size = 40, className }: LumenGuideAvatarProps) {
  const gradientId = `lumen-guide-glow-${mood}`;
  const isThinking = mood === 'thinking';
  const showCompanion = mood === 'happy' || mood === 'celebrating';

  return (
    <svg width={size} height={size} viewBox="0 0 48 48" fill="none" className={className} aria-hidden="true">
      <defs>
        <radialGradient id={gradientId} cx="38%" cy="32%" r="75%">
          <stop offset="0%" stopColor="#F6E7B4" />
          <stop offset="55%" stopColor="#D4AF37" />
          <stop offset="100%" stopColor="#8D6C1B" />
        </radialGradient>
      </defs>
      {/* Halo -- el "brillo" que hace que sea Lumen y no cualquier icono. */}
      <circle cx="24" cy="24" r="19" fill="#D4AF37" opacity="0.18" style={{ filter: 'blur(6px)' }} />

      {mood === 'celebrating' && (
        <g stroke="#D4AF37" strokeWidth="1.6" strokeLinecap="round" opacity="0.8">
          <path d="M7 11l2.2 2.2" />
          <path d="M41 11l-2.2 2.2" />
          <path d="M7 31l2.2-2.2" />
          <path d="M41 31l-2.2-2.2" />
        </g>
      )}

      {/* Destello principal -- geometrico, sin ojos ni boca. */}
      <path
        d={[
          'M 24 11',
          'Q 25.8 23.2 37 24',
          'Q 25.8 24.8 24 37',
          'Q 22.2 24.8 11 24',
          'Q 22.2 23.2 24 11',
          'Z',
        ].join(' ')}
        fill={`url(#${gradientId})`}
        opacity={isThinking ? 0.55 : 1}
      />

      {/* Destello acompañante -- solo en los animos "con vida" (happy /
          celebrating), como un segundo punto de luz que responde al primero.
          En "thinking" aparece en su lugar un punto tenue y quieto -- la
          version geometrica de "un momento, procesando". */}
      {showCompanion && (
        <path
          d={[
            'M 36 10',
            'Q 36.8 13.8 40.5 14.5',
            'Q 36.8 15.2 36 19',
            'Q 35.2 15.2 31.5 14.5',
            'Q 35.2 13.8 36 10',
            'Z',
          ].join(' ')}
          fill="#F6E7B4"
        />
      )}
      {isThinking && <circle cx="36.5" cy="14.5" r="2" fill="#D4AF37" opacity="0.55" />}
    </svg>
  );
}
