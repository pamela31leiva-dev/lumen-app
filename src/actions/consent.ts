'use server';

import { getSupabaseServerClient } from '@/infrastructure/supabase/server';

/**
 * Registra la aceptacion explicita de Terminos y Politica de Tratamiento de
 * Datos (Ley 1581 de 2012, Habeas Data). Unica via para fijar estas
 * columnas: handle_new_user() (0011) ya NO las fija automaticamente al
 * crear el usuario -- deben ser un acto real de la persona.
 */
export async function acceptTermsAndPrivacy(): Promise<{ success: true } | { success: false; error: string }> {
  const supabase = await getSupabaseServerClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();
  if (authError || !user) {
    return { success: false, error: 'No autorizado' };
  }

  const now = new Date().toISOString();
  const { error } = await supabase
    .from('profiles')
    .update({ terms_accepted_at: now, privacy_consent_at: now })
    .eq('id', user.id);

  if (error) {
    console.error('Error al registrar la aceptacion de terminos:', error);
    return { success: false, error: 'No se pudo registrar tu aceptacion. Intenta de nuevo.' };
  }

  return { success: true };
}
