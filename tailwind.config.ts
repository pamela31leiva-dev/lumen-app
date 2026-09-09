import type { Config } from 'tailwindcss';

export default {
  content: ['./src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        // Dark Elevated Theme — banca privada de alto nivel.
        obsidian: '#0B0F17', // fondo base de pagina
        elevated: '#111827', // superficie de tarjetas (Dark Slate)
        gold: {
          DEFAULT: '#D4AF37', // Champagne Gold — saldos maestros / estatus
          soft: 'rgb(212 175 55 / 0.12)',
        },
        growth: {
          DEFAULT: '#059669', // Esmeralda Mate — dato: balances/metricas positivas (nunca botones)
          soft: 'rgb(5 150 105 / 0.12)',
        },
        wealth: {
          // Verde esmeralda mate para botones de accion — mismo matiz que growth,
          // pero desaturado y mas oscuro para evitar el efecto neon en superficies solidas.
          DEFAULT: '#2F6F5E',
          hover: '#3A8573',
        },
      },
    },
  },
  plugins: [],
} satisfies Config;
