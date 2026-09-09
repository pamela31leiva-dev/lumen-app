'use server';

import { reportError } from '@/lib/telemetry/reporter';

export interface ClientErrorInput {
  message: string;
  stack?: string;
  digest?: string;
  url?: string;
}

/**
 * Puente para reportar errores desde Client Components (error.tsx,
 * global-error.tsx) sin exponerles SUPABASE_SERVICE_ROLE_KEY ni ningun
 * secreto — la escritura real en system_logs ocurre en reportError, que
 * solo corre en el servidor.
 */
export async function reportClientError(input: ClientErrorInput): Promise<void> {
  await reportError({
    source: 'client-error-boundary',
    message: input.message,
    stack: input.stack,
    digest: input.digest,
    url: input.url,
  });
}
