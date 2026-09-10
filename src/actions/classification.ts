'use server';

import { getSupabaseServerClient } from '@/infrastructure/supabase/server';

/**
 * Guarda la respuesta del usuario a una pregunta de clarificacion de la IA
 * (ver EXTRACTION_SYSTEM_PROMPT / GeminiExtractionProvider) y actualiza la
 * descripcion de la transaccion con esa respuesta. El aprendizaje se inyecta
 * como contexto en futuras capturas del mismo espacio (ver capture.ts), asi
 * la IA no vuelve a preguntar lo mismo.
 */
export async function saveClassificationHint(params: {
  space_id: string;
  transaction_id: string;
  question: string;
  answer: string;
}): Promise<{ success: true } | { success: false; error: string }> {
  const supabase = await getSupabaseServerClient();

  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();
  if (authError || !user) {
    return { success: false, error: 'No autorizado' };
  }

  const trimmedAnswer = params.answer.trim();
  if (!trimmedAnswer) {
    return { success: false, error: 'Escribe una respuesta breve.' };
  }

  const { error: hintError } = await supabase.from('classification_hints').insert({
    space_id: params.space_id,
    question: params.question,
    answer: trimmedAnswer,
    created_by: user.id,
  });

  if (hintError) {
    console.error('Error al guardar el aprendizaje de clasificacion:', hintError);
    return { success: false, error: 'No se pudo guardar la respuesta.' };
  }

  const { data: transaction } = await supabase
    .from('transactions')
    .select('description')
    .eq('id', params.transaction_id)
    .eq('space_id', params.space_id)
    .single();

  const currentDescription = transaction?.description ?? '';
  const updatedDescription = currentDescription ? `${currentDescription} — ${trimmedAnswer}` : trimmedAnswer;

  const { error: updateError } = await supabase
    .from('transactions')
    .update({ description: updatedDescription })
    .eq('id', params.transaction_id)
    .eq('space_id', params.space_id);

  if (updateError) {
    console.error('Error al actualizar la descripcion con la clarificacion:', updateError);
    return { success: false, error: 'La respuesta se guardo, pero no se pudo actualizar el movimiento.' };
  }

  return { success: true };
}
