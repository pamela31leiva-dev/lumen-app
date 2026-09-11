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

/**
 * "Guarda tu espacio": convierte una cuenta anonima de Modo Fantasma en una
 * cuenta permanente con correo/contrasena, SIN perder nada -- Supabase
 * conserva el mismo auth.uid(), asi que el espacio, las cuentas y los
 * movimientos ya registrados siguen intactos. Este es tambien el momento en
 * que la persona entrega su primer dato personal real, asi que aqui (y no
 * antes) se le pide el consentimiento explicito de Habeas Data.
 *
 * Nota: si el proyecto tiene "Confirm email" activado en Supabase Auth,
 * updateUser() dispara un correo de confirmacion y la cuenta no queda 100%
 * promovida hasta que la persona lo confirme -- el perfil ya se actualiza
 * aqui igual, pero seria prudente advertirle que revise su correo.
 */
export async function upgradeAnonymousAccount(
  email: string,
  password: string,
  acceptedTerms: boolean,
): Promise<{ success: true } | { success: false; error: string }> {
  const supabase = await getSupabaseServerClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();
  if (authError || !user) {
    return { success: false, error: 'No autorizado' };
  }
  if (!user.is_anonymous) {
    return { success: false, error: 'Esta cuenta ya esta guardada.' };
  }
  if (!acceptedTerms) {
    return { success: false, error: 'Debes aceptar el tratamiento de tus datos para guardar tu espacio.' };
  }
  if (password.length < 8) {
    return { success: false, error: 'La contrasena debe tener al menos 8 caracteres.' };
  }

  const { error: updateError } = await supabase.auth.updateUser({ email, password });
  if (updateError) {
    return { success: false, error: updateError.message };
  }

  const now = new Date().toISOString();
  const { error: profileError } = await supabase
    .from('profiles')
    .update({ email, terms_accepted_at: now, privacy_consent_at: now })
    .eq('id', user.id);

  if (profileError) {
    console.error('Error al actualizar el perfil tras guardar la cuenta anonima:', profileError);
    return {
      success: false,
      error: 'Tu correo se guardo, pero hubo un problema actualizando tu perfil. Vuelve a intentarlo.',
    };
  }

  return { success: true };
}
