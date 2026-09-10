import { createServerClient, type CookieOptions } from '@supabase/ssr';
import type { User } from '@supabase/supabase-js';
import { NextResponse, type NextRequest } from 'next/server';
import { ACTIVE_SPACE_COOKIE } from '@/lib/constants';
import { getValidatedSupabaseEnv } from '@/infrastructure/supabase/env';

const PRIVATE_PREFIXES = ['/executive-board', '/settings', '/privacy'];
const PUBLIC_AUTH_PREFIXES = ['/login', '/register'];

/**
 * Refresca la sesion de Supabase en cada request, protege rutas privadas
 * (redirige a /login sin sesion), evita que un usuario autenticado vea
 * /login, /register o el landing publico (lo manda directo a
 * /executive-board), y asegura que /executive-board siempre tenga una
 * cookie active_space_id valida antes de que la pagina renderice.
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
