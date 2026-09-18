import type { Metadata, Viewport } from 'next';
import './globals.css';
import { SessionModeGuard } from '@/components/auth/SessionModeGuard';
import { ServiceWorkerRegistration } from '@/components/ServiceWorkerRegistration';

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
    statusBarStyle: 'default',
    title: 'Lumen',
  },
};

export const viewport: Viewport = {
  themeColor: '#FAFAF9',
  // viewportFit=cover habilita env(safe-area-inset-*) en CSS -- sin esto, la
  // barra inferior fija (MobileBottomNav) y otros elementos anclados al
  // fondo quedan tapados por el home indicator en iPhones con notch.
  viewportFit: 'cover',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es">
      <body>
        <SessionModeGuard />
        <ServiceWorkerRegistration />
        {children}
      </body>
    </html>
  );
}
