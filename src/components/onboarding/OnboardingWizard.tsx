'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { completeOnboarding } from '@/actions/onboarding';
import { LumenGuideAvatar, type LumenGuideMood } from '@/components/guide/LumenGuideAvatar';
import { CustomSelect } from '@/components/ui/CustomSelect';
import { ONBOARDING_GOAL_OPTIONS, ONBOARDING_SPACE_TYPE_OPTIONS, type OnboardingGoal } from '@/domain/types/onboarding';
import type { AccountType, SpaceType } from '@/domain/types/dashboard';

const ACCOUNT_TYPE_OPTIONS: { value: AccountType; label: string }[] = [
  { value: 'bank', label: 'Banco' },
  { value: 'cash', label: 'Efectivo' },
  { value: 'digital_wallet', label: 'Billetera digital' },
  { value: 'credit_card', label: 'Tarjeta de credito' },
  { value: 'investment', label: 'Inversion' },
  { value: 'other', label: 'Otros' },
];

const TOTAL_STEPS = 3;
const STEP_MOOD: Record<number, LumenGuideMood> = { 1: 'happy', 2: 'default', 3: 'thinking' };

interface OnboardingWizardProps {
  firstName: string | null;
}

/**
 * Wizard de Bienvenida (Fase 3): 3 pasos, sin poder atascarse -- cada
 * pregunta ya trae una respuesta razonable preseleccionada, asi que
 * "Continuar" siempre avanza aunque la persona no toque nada. La cuenta
 * inicial del paso 3 es explicitamente opcional (se puede agregar despues
 * desde el Panorama). Al terminar: elige/crea el espacio, crea la cuenta si
 * la lleno, aplica las sugerencias fiscales estandar del espacio y manda a
 * /executive-board -- ver actions/onboarding.ts para el detalle de cada
 * paso server-side.
 */
export function OnboardingWizard({ firstName }: OnboardingWizardProps) {
  const router = useRouter();
  const [step, setStep] = useState(1);
  const [spaceType, setSpaceType] = useState<SpaceType>('personal');
  const [goal, setGoal] = useState<OnboardingGoal>('organize');
  const [accountName, setAccountName] = useState('');
  const [accountType, setAccountType] = useState<AccountType>('bank');
  const [openingBalance, setOpeningBalance] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function handleFinish() {
    setError(null);
    startTransition(async () => {
      try {
        const parsedBalance = openingBalance.trim() ? Number(openingBalance) : undefined;
        const result = await completeOnboarding({
          spaceType,
          goal,
          accountName: accountName.trim() || undefined,
          accountType,
          openingBalance: parsedBalance,
        });
        if (!result.success) {
          setError(result.error);
          return;
        }
        router.push('/executive-board');
        router.refresh();
      } catch (err) {
        console.error('Error de red al terminar el Wizard de Bienvenida:', err);
        setError('Se perdio la conexion antes de terminar. Intenta de nuevo.');
      }
    });
  }

  return (
    <div className="w-full max-w-lg rounded-2xl border border-white/10 bg-elevated p-8 shadow-2xl shadow-black/40">
      <div className="flex items-center justify-between">
        <LumenGuideAvatar mood={STEP_MOOD[step]} size={44} />
        <div className="flex items-center gap-1.5">
          {Array.from({ length: TOTAL_STEPS }, (_, i) => i + 1).map((dot) => (
            <span key={dot} className={dot <= step ? 'h-1.5 w-5 rounded-full bg-gold' : 'h-1.5 w-5 rounded-full bg-white/10'} />
          ))}
        </div>
      </div>

      {step === 1 && (
        <div className="mt-6">
          <h1 className="text-xl font-medium text-stone-100">{firstName ? `Hola, ${firstName}` : 'Hola'}</h1>
          <p className="mt-2 text-sm text-stone-300">
            Soy Lumen. Antes de mostrarte tu Panorama, te hago un par de preguntas rapidas para dejar todo listo a tu
            medida: tu tipo de espacio y tu meta principal. Menos de un minuto.
          </p>
          <button
            type="button"
            onClick={() => setStep(2)}
            className="mt-6 w-full rounded-lg bg-wealth px-4 py-2.5 text-sm font-medium text-white transition hover:bg-wealth-hover"
          >
            Empecemos
          </button>
        </div>
      )}

      {step === 2 && (
        <div className="mt-6">
          <h2 className="text-lg font-medium text-stone-100">¿Para que vas a usar Lumen, principalmente?</h2>
          <p className="mt-1 text-xs text-stone-500">Puedes crear otros espacios despues -- esto solo arma el primero.</p>
          <div className="mt-4 flex flex-col gap-2">
            {ONBOARDING_SPACE_TYPE_OPTIONS.map((option) => {
              const isActive = spaceType === option.value;
              return (
                <button
                  key={option.value}
                  type="button"
                  onClick={() => setSpaceType(option.value)}
                  className={
                    isActive
                      ? 'rounded-lg border border-gold bg-gold/10 px-4 py-3 text-left transition'
                      : 'rounded-lg border border-white/10 px-4 py-3 text-left transition hover:bg-white/5'
                  }
                >
                  <p className={isActive ? 'text-sm font-medium text-gold' : 'text-sm font-medium text-stone-200'}>{option.title}</p>
                  <p className="mt-0.5 text-xs text-stone-500">{option.description}</p>
                </button>
              );
            })}
          </div>
          <div className="mt-6 flex items-center justify-between">
            <button type="button" onClick={() => setStep(1)} className="text-xs font-medium text-stone-500 hover:text-stone-300">
              Atras
            </button>
            <button
              type="button"
              onClick={() => setStep(3)}
              className="rounded-lg bg-wealth px-4 py-2.5 text-sm font-medium text-white transition hover:bg-wealth-hover"
            >
              Continuar
            </button>
          </div>
        </div>
      )}

      {step === 3 && (
        <div className="mt-6">
          <h2 className="text-lg font-medium text-stone-100">¿Cual es tu meta principal ahora mismo?</h2>
          <div className="mt-4 flex flex-col gap-2">
            {ONBOARDING_GOAL_OPTIONS.map((option) => {
              const isActive = goal === option.value;
              return (
                <button
                  key={option.value}
                  type="button"
                  onClick={() => setGoal(option.value)}
                  className={
                    isActive
                      ? 'rounded-lg border border-gold bg-gold/10 px-4 py-2.5 text-left text-sm font-medium text-gold transition'
                      : 'rounded-lg border border-white/10 px-4 py-2.5 text-left text-sm font-medium text-stone-200 transition hover:bg-white/5'
                  }
                >
                  {option.label}
                </button>
              );
            })}
          </div>

          <div className="mt-5 rounded-lg border border-white/10 bg-page p-4">
            <p className="text-xs font-medium text-stone-300">Tu primera cuenta (opcional)</p>
            <p className="mt-0.5 text-[11px] text-stone-500">Si prefieres, puedes agregarla despues desde el Panorama.</p>
            <div className="mt-3 flex flex-col gap-3 sm:flex-row">
              <input
                value={accountName}
                onChange={(e) => setAccountName(e.target.value)}
                placeholder="ej. Cuenta de ahorros"
                className="flex-1 rounded-lg border border-white/10 bg-elevated px-3 py-2 text-sm text-stone-100 placeholder:text-stone-600 focus:border-emerald-600 focus:outline-none focus:ring-1 focus:ring-emerald-600"
              />
              <div className="w-full sm:w-40">
                <CustomSelect value={accountType} onChange={(v) => setAccountType(v as AccountType)} options={ACCOUNT_TYPE_OPTIONS} />
              </div>
            </div>
            {accountName.trim() && (
              <input
                value={openingBalance}
                onChange={(e) => setOpeningBalance(e.target.value)}
                inputMode="decimal"
                placeholder="Saldo inicial (opcional, ej. 500000)"
                className="mt-3 w-full rounded-lg border border-white/10 bg-elevated px-3 py-2 text-sm text-stone-100 placeholder:text-stone-600 focus:border-emerald-600 focus:outline-none focus:ring-1 focus:ring-emerald-600"
              />
            )}
          </div>

          {error && <p className="mt-3 text-xs text-red-400">{error}</p>}

          <div className="mt-6 flex items-center justify-between">
            <button type="button" onClick={() => setStep(2)} disabled={isPending} className="text-xs font-medium text-stone-500 hover:text-stone-300">
              Atras
            </button>
            <button
              type="button"
              onClick={handleFinish}
              disabled={isPending}
              className="rounded-lg bg-wealth px-4 py-2.5 text-sm font-medium text-white transition hover:bg-wealth-hover disabled:cursor-not-allowed disabled:opacity-60"
            >
              {isPending ? 'Configurando...' : 'Terminar'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
