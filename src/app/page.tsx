import Link from 'next/link';
import { AppFooter } from '@/components/AppFooter';

export default function HomePage() {
  return (
    <div className="flex min-h-screen flex-col bg-obsidian text-stone-100">
      <main className="flex flex-1 flex-col items-center justify-center gap-4 p-8 text-center">
        <h1 className="text-2xl font-medium text-gold">Lumen</h1>
        <p className="text-xs uppercase tracking-[0.2em] text-stone-500">Inteligencia Patrimonial</p>
        <p className="max-w-md text-sm text-stone-400">
          Convierte texto, voz, fotos y documentos en claridad sobre tu patrimonio.
        </p>
        <Link
          href="/login"
          className="rounded-full bg-wealth px-5 py-2 text-sm font-medium text-white transition hover:bg-wealth-hover"
        >
          Iniciar sesion
        </Link>
      </main>
      <AppFooter />
    </div>
  );
}
