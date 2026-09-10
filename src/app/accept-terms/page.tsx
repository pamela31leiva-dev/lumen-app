import { redirect } from 'next/navigation';
import { getSupabaseServerClient } from '@/infrastructure/supabase/server';
import { AcceptTermsGate } from '@/components/auth/AcceptTermsGate';

/**
 * Interceptor obligatorio de Terminos y Habeas Data (Ley 1581 de 2012).
 * El middleware redirige aqui a cualquier usuario autenticado cuyo
 * terms_accepted_at siga en NULL, antes de dejarlo llegar a /executive-board
 * o cualquier otra ruta privada -- cubre tanto registro por correo como
 * primer inicio de sesion con Google OAuth.
 */
export default async function AcceptTermsPage() {
  const supabase = await getSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  return (
    <div className="flex min-h-screen items-center justify-center bg-obsidian px-4 py-8 text-stone-100">
      <AcceptTermsGate />
    </div>
  );
}
