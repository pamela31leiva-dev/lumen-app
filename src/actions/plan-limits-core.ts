import type { AnySupabaseClient } from '@/actions/merchant-rules-core';

export interface SpacePlanLimits {
  ownerId: string;
  /** Fuente unica de verdad (Bloque P9): spaces.is_pro O el dueño tiene un plan pro/premium activo -- ver get_space_plan_limits (0036). */
  isPro: boolean;
  /** null = sin limite aplicado todavia (convencion de subscriptions, ver 0008). */
  maxSpaces: number | null;
  maxMonthlyRecords: number | null;
  maxStorageMb: number | null;
}

/**
 * Unico punto de lectura de "es Pro este espacio, y con que limites" -- ver
 * el comentario de get_space_plan_limits en 0036 para por que esto
 * reemplaza leer spaces.is_pro o subscriptions por separado. null solo si
 * el space_id no existe (nunca deberia pasar si RLS/el token ya lo validaron
 * antes de llegar aqui).
 */
export async function getSpacePlanLimitsWithClient(supabase: AnySupabaseClient, spaceId: string): Promise<SpacePlanLimits | null> {
  const { data, error } = await supabase
    .rpc('get_space_plan_limits', { p_space_id: spaceId })
    .maybeSingle<{ owner_id: string; is_pro: boolean; max_spaces: number | null; max_monthly_records: number | null; max_storage_mb: number | null }>();

  if (error || !data) {
    if (error) console.error('Error al leer los limites de plan del espacio:', error);
    return null;
  }

  return {
    ownerId: data.owner_id,
    isPro: data.is_pro,
    maxSpaces: data.max_spaces,
    maxMonthlyRecords: data.max_monthly_records,
    maxStorageMb: data.max_storage_mb,
  };
}

export type PlanLimitCheck = { allowed: true } | { allowed: false; error: string };

/**
 * max_spaces (Bloque P9): se evalua sobre el DUEÑO que va a crear el espacio
 * nuevo (siempre el usuario que llama, nunca un tercero), leyendo su propia
 * fila de subscriptions directo -- no hace falta la funcion SECURITY DEFINER
 * aqui porque subscriptions_select_own (0008) ya deja a cualquiera ver SU
 * PROPIO plan sin necesidad de cruzar la RLS de nadie mas.
 */
export async function checkSpaceCreationLimitWithClient(supabase: AnySupabaseClient, userId: string): Promise<PlanLimitCheck> {
  const { data: sub } = await supabase.from('subscriptions').select('max_spaces').eq('user_id', userId).maybeSingle<{ max_spaces: number | null }>();
  if (!sub || sub.max_spaces === null) return { allowed: true };

  const { count, error } = await supabase.from('spaces').select('id', { count: 'exact', head: true }).eq('owner_id', userId);
  if (error) {
    // Cero Friccion: un fallo al CONTAR nunca bloquea la creacion -- solo
    // significa que, por ahora, el limite no se pudo verificar.
    console.error('Error al contar los espacios existentes:', error);
    return { allowed: true };
  }

  if ((count ?? 0) >= sub.max_spaces) {
    return {
      allowed: false,
      error: `Ya tienes ${count} espacios, el limite de tu plan actual (${sub.max_spaces}). Mejora tu plan para crear mas.`,
    };
  }
  return { allowed: true };
}

/**
 * max_monthly_records (Bloque P9): cuenta movimientos CONFIRMADOS de este
 * espacio en el mes calendario en curso (mismo limite de mes que
 * get_monthly_report, 0028) contra el limite del DUEÑO del espacio -- un
 * espacio compartido se factura a quien lo posee, no a cada miembro por
 * separado. Se llama antes de que un movimiento pase a confirmed
 * (confirmTransaction) y antes de iniciar una importacion masiva
 * (processBulkImport): si el espacio ya esta en o sobre el limite, ninguna
 * fila nueva se confirma hasta el proximo mes o una mejora de plan.
 */
export async function checkMonthlyRecordLimitWithClient(supabase: AnySupabaseClient, spaceId: string): Promise<PlanLimitCheck> {
  const limits = await getSpacePlanLimitsWithClient(supabase, spaceId);
  if (!limits || limits.maxMonthlyRecords === null) return { allowed: true };

  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();

  const { count, error } = await supabase
    .from('transactions')
    .select('id', { count: 'exact', head: true })
    .eq('space_id', spaceId)
    .eq('status', 'confirmed')
    .gte('transaction_date', monthStart);

  if (error) {
    console.error('Error al contar los movimientos del mes:', error);
    return { allowed: true };
  }

  if ((count ?? 0) >= limits.maxMonthlyRecords) {
    return {
      allowed: false,
      error: `Este espacio ya tiene ${count} movimientos confirmados este mes, el limite de su plan (${limits.maxMonthlyRecords}). Mejora el plan para seguir registrando, o espera al proximo mes.`,
    };
  }
  return { allowed: true };
}

const BYTES_PER_MB = 1024 * 1024;
/** Tope de paginacion de Storage.list() (maximo real de la API) -- se pagina hasta agotar el bucket del espacio. */
const STORAGE_LIST_PAGE_SIZE = 1000;

/**
 * max_storage_mb (Bloque P9): suma el tamaño real de los archivos ya
 * subidos a Storage para este espacio (bucket `receipts`, carpeta
 * `<space_id>/`) -- se consulta Storage directamente en vez de mantener un
 * contador propio en la base de datos, para que nunca se desincronice de lo
 * que en verdad ocupa espacio (ej. si un archivo se borra por fuera del
 * flujo normal). incomingBytes es el archivo que se esta a punto de subir;
 * se rechaza ANTES de subirlo si el total resultante superaria el limite.
 */
export async function checkStorageQuotaWithClient(supabase: AnySupabaseClient, spaceId: string, incomingBytes: number): Promise<PlanLimitCheck> {
  const limits = await getSpacePlanLimitsWithClient(supabase, spaceId);
  if (!limits || limits.maxStorageMb === null) return { allowed: true };

  let totalBytes = 0;
  let offset = 0;
  for (;;) {
    const { data: files, error } = await supabase.storage.from('receipts').list(spaceId, { limit: STORAGE_LIST_PAGE_SIZE, offset });
    if (error) {
      console.error('Error al calcular el almacenamiento usado:', error);
      return { allowed: true };
    }
    for (const file of files ?? []) {
      totalBytes += file.metadata?.size ?? 0;
    }
    if (!files || files.length < STORAGE_LIST_PAGE_SIZE) break;
    offset += STORAGE_LIST_PAGE_SIZE;
  }

  const maxBytes = limits.maxStorageMb * BYTES_PER_MB;
  if (totalBytes + incomingBytes > maxBytes) {
    return {
      allowed: false,
      error: `Este espacio ya uso ${(totalBytes / BYTES_PER_MB).toFixed(1)}MB de los ${limits.maxStorageMb}MB de tu plan. Mejora tu plan o borra documentos viejos para subir archivos nuevos.`,
    };
  }
  return { allowed: true };
}
