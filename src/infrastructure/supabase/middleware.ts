import { createServerClient, type CookieOptions } from '@supabase/ssr';
import type { User } from '@supabase/supabase-js';
import { NextResponse, type NextRequest } from 'next/server';
import { ACTIVE_SPACE_COOKIE } from '@/lib/constants';
import { getValidatedSupabaseEnv } from '@/infrastructure/supabase/env';

const PRIVATE_PREFIXES = ['/executive-board', '/settings', '/privacy'];
const PUBLIC_AUTH_PREFIXES = ['/login', '/register'];
const ACCEPT_TERMS_PATH = '/accept-terms';
// /privacy queda exento del gate de consentimiento a proposito: la persona
// debe poder leer la politica completa este o no aceptada todavia.
const CONSENT_EXEMPT_PREFIXES = [ACCEPT_TERMS_PATH, '/privacy'];

/**
 * Refresca la sesion de Supabase en cada request, protege rutas privadas
 * (redirige a /login sin sesion), evita que un usuario autenticado vea
 * /login, /register o el landing publico (lo manda directo a
 * /executive-board), asegura que /executive-board siempre tenga una
 * cookie active_space_id valida antes de que la pagina renderice, y exige
 * aceptacion explicita de Terminos/Habeas Data en /accept-terms antes de
 * dejar pasar a cualquier otra ruta (ver CONSENT_EXEMPT_PREFIXES).
 * (/dashboard ya no es una ruta protegida aqui: next.config.mjs la
 * redirige a /executive-board, que si esta protegida).
 *
 * El middleware corre en (casi) TODA request, asi que nada aqui puede
 * lanzar sin capturar: una excepcion sin atrapar tumba la app entera con
 * MIDDLEWARE_INVOCATION_FAILED (esto paso en vivo: env var mal configurada
 * -> getValidatedSupabaseEnv() lanzaba -> cada request, incluido /login,
 * crasheaba). Si Supabase no esta disponible o mal configurado, se trata
 * como "sin sesion" (fail-closed en rutas privadas via el redirect ya
 * existente a /login) en vez de romper la respuesta.
 */
export async function updateSupabaseSession(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const isPrivateRoute = PRIVATE_PREFIXES.some((prefix) => pathname.startsWith(prefix));
  const isPublicAuthRoute = PUBLIC_AUTH_PREFIXES.some((prefix) => pathname.startsWith(prefix));

  let response = NextResponse.next({ request });
  let supabase: ReturnType<typeof createServerClient> | null = null;

  try {
    const { url: supabaseUrl, anonKey: supabaseAnonKey } = getValidatedSupabaseEnv();
    supabase = createServerClient(supabaseUrl, supabaseAnonKey, {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet: { name: string; value: string; options: CookieOptions }[]) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
          response = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
        },
      },
    });
  } catch (err) {
    console.error(
      '[LUMEN MIDDLEWARE] Supabase mal configurado, se continua sin sesion:',
      err instanceof Error ? err.message : err,
    );
  }

  let user: User | null = null;
  if (supabase) {
    try {
      const { data } = await supabase.auth.getUser();
      user = data.user;
    } catch (err) {
      console.error('[LUMEN MIDDLEWARE] getUser() fallo, se continua sin sesion:', err instanceof Error ? err.message : err);
    }
  }

  if (isPrivateRoute && !user) {
    return NextResponse.redirect(new URL('/login', request.url));
  }

  // Gate obligatorio de Terminos/Habeas Data (Ley 1581 de 2012): un usuario
  // autenticado sin terms_accepted_at no puede llegar a ninguna ruta salvo
  // las exentas, sin importar si viene de /login, /register, Google OAuth o
  // la raiz publica. Si la consulta falla, se falla ABIERTO (se trata como
  // ya aceptado): este chequeo es de cumplimiento, no de seguridad de acceso
  // -- bloquear a todo el mundo por un error transitorio de esta consulta
  // seria peor que dejar pasar ocasionalmente sin el gate.
  const isConsentExempt = CONSENT_EXEMPT_PREFIXES.some((prefix) => pathname.startsWith(prefix));
  let hasAcceptedTerms = true;
  if (user && supabase) {
    try {
      const { data: profile } = await supabase.from('profiles').select('terms_accepted_at').eq('id', user.id).maybeSingle();
      hasAcceptedTerms = Boolean(profile?.terms_accepted_at);
    } catch (err) {
      console.error(
        '[LUMEN MIDDLEWARE] Lookup de consentimiento fallo, se trata como ya aceptado:',
        err instanceof Error ? err.message : err,
      );
    }
  }

  // Modo Fantasma: un usuario anonimo (signInAnonymously, ver app/page.tsx)
  // todavia no entrego ningun dato personal real -- exigirle el gate de
  // Habeas Data antes de dejarlo ni probar la app seria la misma friccion
  // que el Modo Fantasma existe para eliminar. El consentimiento se pide
  // como parte del flujo de "guardar tu espacio" (upgradeAnonymousAccount),
  // que es el momento en que si aporta un dato real (su correo).
  if (user && !hasAcceptedTerms && !isConsentExempt && !user.is_anonymous) {
    return NextResponse.redirect(new URL(ACCEPT_TERMS_PATH, request.url));
  }
  if (user && hasAcceptedTerms && pathname === ACCEPT_TERMS_PATH) {
    return NextResponse.redirect(new URL('/executive-board', request.url));
  }

  if (isPublicAuthRoute && user) {
    return NextResponse.redirect(new URL('/executive-board', request.url));
  }

  if (pathname === '/' && user) {
    return NextResponse.redirect(new URL('/executive-board', request.url));
  }

  if (pathname.startsWith('/executive-board') && user && supabase) {
    try {
      const cookieSpaceId = request.cookies.get(ACTIVE_SPACE_COOKIE)?.value;
      let hasValidActiveSpace = false;

      if (cookieSpaceId) {
        const { data: membership } = await supabase
          .from('space_members')
          .select('space_id')
          .eq('space_id', cookieSpaceId)
          .eq('user_id', user.id)
          .maybeSingle();
        hasValidActiveSpace = Boolean(membership);
      }

      if (!hasValidActiveSpace) {
        const { data: firstMembership } = await supabase
          .from('space_members')
          .select('space_id')
          .eq('user_id', user.id)
          .order('joined_at', { ascending: true })
          .limit(1)
          .maybeSingle();

        if (firstMembership) {
          response.cookies.set(ACTIVE_SPACE_COOKIE, firstMembership.space_id, {
            path: '/',
            maxAge: 60 * 60 * 24 * 365,
          });
        }
      }
    } catch (err) {
      console.error(
        '[LUMEN MIDDLEWARE] Lookup de active-space fallo, se continua sin fijar cookie:',
        err instanceof Error ? err.message : err,
      );
    }
  }

  return response;
}
