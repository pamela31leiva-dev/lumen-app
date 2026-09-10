import { NextResponse } from 'next/server';
import { getSupabaseServerClient } from '@/infrastructure/supabase/server';
import { reportError } from '@/lib/telemetry/reporter';

/**
 * Destino de redireccion de Supabase tras el flujo OAuth (Google, etc).
 * Intercambia el `code` por una sesion real antes de mandar al usuario a su espacio.
 * Requiere que el proveedor Google este habilitado en el dashboard de Supabase
 * (Authentication > Providers) con sus credenciales de Google Cloud — eso es
 * configuracion externa que no se puede hacer desde el codigo.
 *
 * "next" por defecto es /executive-board (no "/"): "/" es el landing publico
 * y el middleware ya lo redirige a /executive-board para sesiones activas,
 * asi que aterrizar ahi directo evita un salto extra.
 */
export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get('code');
  const oauthError = searchParams.get('error');
  const oauthErrorDescription = searchParams.get('error_description');
  const next = searchParams.get('next') ?? '/executive-board';

  // Detras del proxy de Vercel, `origin` (derivado de request.url) puede no
  // coincidir con el dominio publico real. x-forwarded-host es el patron
  // oficial de Supabase para este caso; en local no hace falta.
  const forwardedHost = request.headers.get('x-forwarded-host');
  const isLocalEnv = process.env.NODE_ENV === 'development';
  const redirectOrigin = !isLocalEnv && forwardedHost ? `https://${forwardedHost}` : origin;

  // Google/Supabase pueden volver con ?error=... en vez de ?code=... (el
  // usuario cancelo, el provider no esta bien configurado, etc).
  if (oauthError) {
    await reportError({
      source: 'oauth-callback-provider-error',
      message: oauthErrorDescription || oauthError,
      context: { error: oauthError },
    });
    return NextResponse.redirect(`${redirectOrigin}/login?error=oauth`);
  }

  if (code) {
    const supabase = await getSupabaseServerClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) {
      return NextResponse.redirect(`${redirectOrigin}${next}`);
    }

    await reportError({
      source: 'oauth-callback-exchange-failed',
      message: error.message,
      context: { status: error.status, code: error.code },
    });
    return NextResponse.redirect(`${redirectOrigin}/login?error=oauth`);
  }

  await reportError({
    source: 'oauth-callback-missing-code',
    message: 'El callback de OAuth se llamo sin "code" ni "error" en la URL.',
  });
  return NextResponse.redirect(`${redirectOrigin}/login?error=oauth`);
}
