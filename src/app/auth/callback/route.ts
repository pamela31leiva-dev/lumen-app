import { NextResponse } from 'next/server';
import { getSupabaseServerClient } from '@/infrastructure/supabase/server';

/**
 * Destino de redireccion de Supabase tras el flujo OAuth (Google, etc).
 * Intercambia el `code` por una sesion real antes de mandar al usuario a su espacio.
 * Requiere que el proveedor Google este habilitado en el dashboard de Supabase
 * (Authentication > Providers) con sus credenciales de Google Cloud — eso es
 * configuracion externa que no se puede hacer desde el codigo.
 */
export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get('code');
  const next = searchParams.get('next') ?? '/executive-board';

  if (code) {
    const supabase = await getSupabaseServerClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) {
      return NextResponse.redirect(`${origin}${next}`);
    }
  }

  return NextResponse.redirect(`${origin}/login?error=oauth`);
}
