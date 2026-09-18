'use server';

import { getSupabaseServerClient } from '@/infrastructure/supabase/server';
import { createSpace, getUserSpaces, setActiveSpace } from '@/actions/dashboard';
import { createAccount, updateOpeningBalance } from '@/actions/accounts';
import { applyStandardFiscalTags } from '@/actions/fiscal';
import { ONBOARDING_DEFAULT_SPACE_NAME, type OnboardingGoal } from '@/domain/types/onboarding';
import type { AccountType, SpaceType } from '@/domain/types/dashboard';

interface CompleteOnboardingInput {
  spaceType: SpaceType;
  goal: OnboardingGoal;
  /** Cuenta inicial opcional (paso 3) -- si viene vacio, se omite sin bloquear nada. */
  accountName?: string;
  accountType?: AccountType;
  openingBalance?: number;
}

/**
 * Cierra el Wizard de Bienvenida (Fase 3): elige o crea el espacio segun lo
 * que la persona conto de su actividad, crea su primera cuenta si la lleno,
 * aplica las sugerencias fiscales estandar del espacio (mismo motor que el
 * boton "Aplicar sugerencias estandar" de Clasificacion Tributaria, ver
 * actions/fiscal.ts) y marca profiles.onboarding_completed_at para que el
 * middleware deje de redirigir aqui.
 *
 * La cuenta inicial es la unica parte verdaderamente opcional: si su
 * creacion falla (ej. moneda invalida en un caso raro), NO se bloquea el
 * resto del wizard -- la persona ya armo su espacio y su clasificacion
 * fiscal, y siempre puede agregar la cuenta despues desde el Panorama. Igual
 * criterio "Cero Friccion" que el resto de la app: una falla secundaria
 * nunca debe trabar el flujo principal.
 */
export async function completeOnboarding(
  input: CompleteOnboardingInput,
): Promise<{ success: true } | { success: false; error: string }> {
  const supabase = await getSupabaseServerClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();
  if (authError || !user) {
    return { success: false, error: 'No autorizado' };
  }

  const existingSpaces = await getUserSpaces();
  let spaceId: string;

  if (input.spaceType === 'personal' && existingSpaces.length > 0) {
    // El primer espacio ya nace tipo "personal" al registrarse -- si la
    // respuesta coincide, se reusa en vez de crear uno duplicado vacio.
    spaceId = existingSpaces[0].id;
  } else {
    const created = await createSpace(ONBOARDING_DEFAULT_SPACE_NAME[input.spaceType], input.spaceType);
    if (!created.success) {
      return { success: false, error: created.error };
    }
    spaceId = created.spaceId;
  }

  await setActiveSpace(spaceId);

  const trimmedAccountName = input.accountName?.trim();
  if (trimmedAccountName) {
    const accountResult = await createAccount(spaceId, trimmedAccountName, input.accountType ?? 'bank', 'COP');
    if (accountResult.success && input.openingBalance && input.openingBalance > 0) {
      const balanceResult = await updateOpeningBalance(accountResult.accountId, spaceId, input.openingBalance);
      if (!balanceResult.success) {
        console.error('Onboarding: no se pudo fijar el saldo inicial de la cuenta creada:', balanceResult.error);
      }
    } else if (!accountResult.success) {
      console.error('Onboarding: no se pudo crear la cuenta inicial:', accountResult.error);
    }
  }

  const fiscalResult = await applyStandardFiscalTags(spaceId);
  if (!fiscalResult.success) {
    console.error('Onboarding: no se pudieron aplicar las sugerencias fiscales estandar:', fiscalResult.error);
  }

  const { error } = await supabase
    .from('profiles')
    .update({ onboarding_completed_at: new Date().toISOString(), primary_goal: input.goal })
    .eq('id', user.id);

  if (error) {
    console.error('Error al marcar el onboarding como completo:', error);
    return { success: false, error: 'Todo quedo configurado, pero no pudimos guardar tu progreso. Recarga la pagina.' };
  }

  return { success: true };
}
