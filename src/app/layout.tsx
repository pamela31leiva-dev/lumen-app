import type { Metadata, Viewport } from 'next';
import './globals.css';
import { SessionModeGuard } from '@/components/auth/SessionModeGuard';

export const metadata: Metadata = {
  title: 'Lumen — Inteligencia Patrimonial',
  description: 'Convierte texto, voz, fotos y documentos en claridad sobre tu patrimonio.',
  manifest: '/manifest.json',
  icons: {
    icon: [
      { url: '/icons/icon-192.png', sizes: '192x192', type: 'image/png' },
      { url: '/icons/icon-512.png', sizes: '512x512', type: 'image/png' },
    ],
    apple: [{ url: '/icons/apple-touch-icon.png', sizes: '180x180', type: 'image/png' }],
  },
  appleWebApp: {
    capable: true,
    statusBarStyle: 'black-translucent',
    title: 'Lumen',
  },
};

export const viewport: Viewport = {
  themeColor: '#0B0F17',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es">
      <body>
        <SessionModeGuard />
        {children}
      </body>
    </html>
  );
}
