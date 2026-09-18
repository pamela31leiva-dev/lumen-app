import { redirect } from 'next/navigation';
import { getSupabaseServerClient } from '@/infrastructure/supabase/server';
import { OnboardingWizard } from '@/components/onboarding/OnboardingWizard';

/**
 * Wizard de Bienvenida (Fase 3). El middleware redirige aqui a cualquier
 * usuario autenticado, no anonimo, con terminos ya aceptados, cuyo
 * onboarding_completed_at siga en NULL -- mismo patron que /accept-terms
 * (ver src/infrastructure/supabase/middleware.ts).
 */
export default async function OnboardingPage() {
  const supabase = await getSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const { data: profile } = await supabase.from('profiles').select('full_name').eq('id', user.id).maybeSingle();
  const firstName = profile?.full_name?.trim().split(/\s+/)[0] || null;

  return (
    <div className="flex min-h-screen items-center justify-center bg-page px-4 py-8">
      <OnboardingWizard firstName={firstName} />
    </div>
  );
}
