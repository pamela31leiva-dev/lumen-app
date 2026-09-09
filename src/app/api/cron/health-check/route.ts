import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { reportError } from '@/lib/telemetry/reporter';

/**
 * Auditoria periodica de salud del sistema — pensada para dispararse cada
 * ~15 dias (ver vercel.json si se despliega en Vercel; en otro hosting,
 * cualquier servicio externo de cron puede llamar esta URL con el mismo
 * header de autorizacion).
 *
 * Revisa:
 *   1. Conectividad a Postgres (via una consulta publica real, sin auth).
 *   2. RLS activo: la MISMA consulta pero a una tabla protegida debe volver
 *      vacia (no un error) para un cliente sin sesion — si en cambio
 *      devolviera filas, seria señal de que RLS no esta filtrando.
 *   3. Que el proveedor de IA configurado tenga sus credenciales presentes
 *      (chequeo de presencia, no una llamada real, para no gastar cuota en
 *      cada corrida de este endpoint).
 */
export async function GET(request: Request) {
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret) {
    const authHeader = request.headers.get('authorization');
    if (authHeader !== `Bearer ${cronSecret}`) {
      return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
    }
  }

  const checkedAt = new Date().toISOString();
  const result = {
    checkedAt,
    postgres: { ok: false, detail: '' },
    rls: { ok: false, detail: '' },
    aiProvider: { ok: false, provider: process.env.AI_PROVIDER ?? 'mock', detail: '' },
  };

  try {
    const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);

    const { error: pgError } = await supabase
      .from('categories')
      .select('id', { count: 'exact', head: true })
      .is('space_id', null);
    result.postgres.ok = !pgError;
    result.postgres.detail = pgError ? pgError.message : 'Conexion a Postgres via PostgREST OK.';

    const { data: rlsRows, error: rlsError } = await supabase.from('transactions').select('id').limit(1);
    if (rlsError) {
      result.rls.ok = false;
      result.rls.detail = `Consulta fallo inesperadamente: ${rlsError.message}`;
    } else if ((rlsRows ?? []).length > 0) {
      result.rls.ok = false;
      result.rls.detail = 'Un cliente sin sesion pudo leer filas de transactions — RLS podria no estar filtrando.';
    } else {
      result.rls.ok = true;
      result.rls.detail = 'Cliente sin sesion no ve filas de transactions, como se espera con RLS activo.';
    }
  } catch (err) {
    result.postgres.detail = err instanceof Error ? err.message : String(err);
  }

  const provider = process.env.AI_PROVIDER ?? 'mock';
  if (provider === 'mock') {
    result.aiProvider.ok = true;
    result.aiProvider.detail = 'Modo mock: no requiere credenciales.';
  } else if (provider === 'openai') {
    result.aiProvider.ok = Boolean(process.env.OPENAI_API_KEY);
    result.aiProvider.detail = result.aiProvider.ok ? 'OPENAI_API_KEY configurada.' : 'Falta OPENAI_API_KEY.';
  } else if (provider === 'gemini') {
    result.aiProvider.ok = Boolean(process.env.GEMINI_API_KEY);
    result.aiProvider.detail = result.aiProvider.ok
      ? 'GEMINI_API_KEY configurada (modo $0).'
      : 'Falta GEMINI_API_KEY.';
  } else if (provider === 'anthropic') {
    const hasAnthropic = Boolean(process.env.ANTHROPIC_API_KEY);
    const hasGeminiFallback = Boolean(process.env.GEMINI_API_KEY);
    result.aiProvider.ok = hasAnthropic;
    result.aiProvider.detail = hasAnthropic
      ? `ANTHROPIC_API_KEY configurada. Respaldo Gemini ${hasGeminiFallback ? 'configurado' : 'NO configurado'}.`
      : 'Falta ANTHROPIC_API_KEY (motor principal).';
  } else {
    result.aiProvider.ok = false;
    result.aiProvider.detail = `AI_PROVIDER="${provider}" no reconocido.`;
  }

  const allOk = result.postgres.ok && result.rls.ok && result.aiProvider.ok;

  if (!allOk) {
    await reportError({
      source: 'health-check',
      message: 'La auditoria periodica encontro al menos un chequeo en rojo.',
      context: result,
    });
  }

  return NextResponse.json({ ok: allOk, ...result }, { status: allOk ? 200 : 503 });
}
