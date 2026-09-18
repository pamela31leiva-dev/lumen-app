import type { Config } from 'tailwindcss';

export default {
  content: ['./src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        // Modo Claro Luminoso (Fase 2) — banca privada de alto nivel, ahora
        // sobre fondos claros. Los tokens leen variables CSS en `globals.css`
        // para que las variantes de opacidad (bg-page/60, bg-elevated/95,
        // gold/15...) sigan funcionando con un solo punto de ajuste de color.
        page: 'rgb(var(--color-page) / <alpha-value>)', // fondo base de pagina (antes "obsidian")
        obsidian: '#0B0F17', // ahora solo texto oscuro (text-obsidian) sobre superficies claras/doradas
        elevated: 'rgb(var(--color-elevated) / <alpha-value>)', // superficie de tarjetas (blanco limpio)
        gold: {
          DEFAULT: 'rgb(var(--color-gold) / <alpha-value>)', // Champagne Gold — saldos maestros / estatus
          soft: 'rgb(var(--color-gold) / 0.12)',
        },
        growth: {
          DEFAULT: 'rgb(var(--color-growth) / <alpha-value>)', // Esmeralda Mate — dato: balances/metricas positivas (nunca botones)
          soft: 'rgb(var(--color-growth) / 0.12)',
        },
        wealth: {
          // Verde esmeralda mate para botones de accion — mismo matiz que growth,
          // pero desaturado y mas oscuro para evitar el efecto neon en superficies solidas.
          DEFAULT: 'rgb(var(--color-wealth) / <alpha-value>)',
          hover: 'rgb(var(--color-wealth-hover) / <alpha-value>)',
        },
      },
    },
  },
  plugins: [],
} satisfies Config;
