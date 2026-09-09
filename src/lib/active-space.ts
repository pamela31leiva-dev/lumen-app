import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { getUserSpaces } from '@/actions/dashboard';
import { ACTIVE_SPACE_COOKIE } from '@/lib/constants';
import type { SpaceSummary } from '@/domain/types/dashboard';

/**
 * Resuelve el espacio activo a partir de la cookie para cualquier pagina
 * protegida distinta de /executive-board. Si el usuario no tiene ningun
 * espacio todavia, lo manda a /executive-board (que si sabe mostrar el
 * flujo de creacion).
 */
export async function requireActiveSpace(): Promise<{ spaces: SpaceSummary[]; activeSpace: SpaceSummary }> {
  const spaces = await getUserSpaces();
  if (spaces.length === 0) {
    redirect('/executive-board');
  }

  const cookieStore = await cookies();
  const cookieSpaceId = cookieStore.get(ACTIVE_SPACE_COOKIE)?.value ?? null;
  const activeSpace = spaces.find((s) => s.id === cookieSpaceId) ?? spaces[0];

  return { spaces, activeSpace };
}
