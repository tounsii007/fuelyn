// ============================================================
// OnboardingModal — First-time user welcome flow
// Shows fuel type selection, vehicle setup prompt, and tips.
// ============================================================

'use client';

import { useState, useCallback } from 'react';
import { useAppStore } from '@/lib/store/app-store';
import { useIsHydrated } from '@/lib/hooks/use-is-hydrated';
import { useTranslations } from '@/lib/hooks/use-translations';
import { FUEL_TYPE_LABELS } from '@fuelyn/core';
import type { FuelType } from '@fuelyn/core';

// STEPS array kept as IDs only — the visible titles are pulled
// from the active locale at render time so we never carry a
// hardcoded German title around in the bundled JS.
const STEP_IDS = ['welcome', 'fuel', 'tips'] as const;

export function OnboardingModal() {
  const { t } = useTranslations();
  const hydrated = useIsHydrated();
  const onboardingDone = useAppStore((s) => s.onboardingDone);
  const setOnboardingDone = useAppStore((s) => s.setOnboardingDone);
  const setFuelType = useAppStore((s) => s.setFuelType);
  const updateSettings = useAppStore((s) => s.updateSettings);

  const [step, setStep] = useState(0);
  const [selectedFuel, setSelectedFuel] = useState<FuelType>('e10');

  const handleNext = useCallback(() => {
    if (step === 1) {
      setFuelType(selectedFuel);
      updateSettings({ defaultFuelType: selectedFuel });
    }
    if (step < STEP_IDS.length - 1) {
      setStep(step + 1);
    } else {
      setOnboardingDone(true);
    }
  }, [step, selectedFuel, setFuelType, updateSettings, setOnboardingDone]);

  // Mount-gate: SSR can't see Zustand-persist'ed state, so the
  // server always renders with the default `onboardingDone=false`
  // and ships the modal HTML. Returning users (who have done
  // onboarding) would then see the modal disappear during client
  // hydration as Zustand restores the persisted true value —
  // exactly the SSR/CSR mismatch React 19 #418 punishes us for.
  // Skipping render until mounted means SSR ships nothing for
  // this modal and the client appears it after hydration via a
  // normal state update, not a hydration mismatch.
  if (!hydrated) return null;
  if (onboardingDone) return null;

  return (
    <div className="fixed inset-0 z-[3000] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm animate-fade-in" />

      <div className="relative w-full max-w-sm bg-white dark:bg-surface-dark-secondary
                      rounded-3xl shadow-xl animate-scale-in overflow-hidden">
        {/* Progress dots */}
        <div className="flex justify-center gap-2 pt-5">
          {STEP_IDS.map((_, i) => (
            <div
              key={i}
              className={`h-1.5 rounded-full transition-all duration-300 ${
                i === step ? 'w-6 bg-brand-600' : 'w-1.5 bg-gray-200 dark:bg-gray-700'
              }`}
            />
          ))}
        </div>

        <div className="p-6">
          {/* Step 0: Welcome */}
          {step === 0 && (
            <div className="text-center">
              <div className="w-20 h-20 bg-brand-50 dark:bg-brand-900/30 rounded-2xl
                              flex items-center justify-center mx-auto mb-4">
                <svg className="w-10 h-10 text-brand-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M15 10.5a3 3 0 11-6 0 3 3 0 016 0z" />
                  <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 10.5c0 7.142-7.5 11.25-7.5 11.25S4.5 17.642 4.5 10.5a7.5 7.5 0 1115 0z" />
                </svg>
              </div>
              <h2 className="text-xl font-bold text-gray-900 dark:text-gray-100 mb-2">
                {t('onboarding.welcome')}
              </h2>
              <p className="text-sm text-gray-500 dark:text-gray-400 leading-relaxed">
                {t('onboarding.welcomeBody')}
              </p>
            </div>
          )}

          {/* Step 1: Fuel Selection */}
          {step === 1 && (
            <div>
              <h2 className="text-xl font-bold text-gray-900 dark:text-gray-100 mb-2 text-center">
                {t('onboarding.fuelQuestion')}
              </h2>
              <p className="text-sm text-gray-500 dark:text-gray-400 mb-5 text-center">
                {t('onboarding.fuelSelect')}
              </p>
              <div className="space-y-2">
                {(Object.entries(FUEL_TYPE_LABELS) as [FuelType, string][]).map(([value, label]) => (
                  <button
                    key={value}
                    type="button"
                    onClick={() => setSelectedFuel(value)}
                    className={`w-full flex items-center gap-3 px-4 py-3.5 rounded-xl text-left
                      transition-all border-2 ${
                        selectedFuel === value
                          ? 'border-brand-600 bg-brand-50 dark:bg-brand-900/20'
                          : 'border-gray-100 dark:border-gray-700 hover:border-gray-200 dark:hover:border-gray-600'
                      }`}
                  >
                    <div className={`w-3 h-3 rounded-full ${
                      value === 'diesel' ? 'bg-fuel-diesel'
                      : value === 'e5' ? 'bg-fuel-e5'
                      : 'bg-fuel-e10'
                    }`} />
                    <span className="text-sm font-medium text-gray-900 dark:text-gray-100">
                      {label}
                    </span>
                    {selectedFuel === value && (
                      <svg className="w-5 h-5 text-brand-600 ml-auto" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
                      </svg>
                    )}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Step 2: Tips */}
          {step === 2 && (
            <div>
              <h2 className="text-xl font-bold text-gray-900 dark:text-gray-100 mb-4 text-center">
                {t('onboarding.howItWorks')}
              </h2>
              <div className="space-y-4">
                <TipRow
                  icon={<svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M9 6.75V15m6-6v8.25m.503 3.498l4.875-2.437c.381-.19.622-.58.622-1.006V4.82c0-.836-.88-1.38-1.628-1.006l-3.869 1.934c-.317.159-.69.159-1.006 0L9.503 3.252a1.125 1.125 0 00-1.006 0L3.622 5.689C3.24 5.88 3 6.27 3 6.695V19.18c0 .836.88 1.38 1.628 1.006l3.869-1.934c.317-.159.69-.159 1.006 0l4.994 2.497c.317.158.69.158 1.006 0z" /></svg>}
                  title={t('onboarding.tipMapTitle')}
                  text={t('onboarding.tipMapText')}
                />
                <TipRow
                  icon={<svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M11.48 3.499a.562.562 0 011.04 0l2.125 5.111a.563.563 0 00.475.345l5.518.442c.499.04.701.663.321.988l-4.204 3.602a.563.563 0 00-.182.557l1.285 5.385a.562.562 0 01-.84.61l-4.725-2.885a.563.563 0 00-.586 0L6.982 20.54a.562.562 0 01-.84-.61l1.285-5.386a.562.562 0 00-.182-.557l-4.204-3.602a.563.563 0 01.321-.988l5.518-.442a.563.563 0 00.475-.345L11.48 3.5z" /></svg>}
                  title={t('onboarding.tipStarTitle')}
                  text={t('onboarding.tipStarText')}
                />
                <TipRow
                  icon={<svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M8.25 18.75a1.5 1.5 0 01-3 0m3 0a1.5 1.5 0 00-3 0m3 0h6m-9 0H3.375a1.125 1.125 0 01-1.125-1.125V14.25m17.25 4.5a1.5 1.5 0 01-3 0m3 0a1.5 1.5 0 00-3 0m3 0h1.125c.621 0 1.129-.504 1.09-1.124a17.902 17.902 0 00-3.213-9.193 2.056 2.056 0 00-1.58-.86H14.25M16.5 18.75h-2.25m0-11.177v-.958c0-.568-.422-1.048-.987-1.106a48.554 48.554 0 00-10.026 0 1.106 1.106 0 00-.987 1.106v7.635m12-6.677v6.677m0 4.5v-4.5m0 0h-12" /></svg>}
                  title={t('onboarding.tipVehicleTitle')}
                  text={t('onboarding.tipVehicleText')}
                />
              </div>
            </div>
          )}

          {/* CTA Button */}
          <button
            type="button"
            onClick={handleNext}
            className="w-full mt-6 py-3 bg-brand-600 text-white text-sm font-semibold
                       rounded-xl hover:bg-brand-700 active:bg-brand-800 transition-colors shadow-sm"
          >
            {step < STEP_IDS.length - 1
              ? t('onboarding.continue')
              : t('onboarding.getStarted')}
          </button>

          {/* Skip */}
          {step === 0 && (
            <button
              type="button"
              onClick={() => setOnboardingDone(true)}
              className="w-full mt-2 py-2 text-xs text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
            >
              {t('onboarding.skip')}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

function TipRow({ icon, title, text }: { icon: React.ReactNode; title: string; text: string }) {
  return (
    <div className="flex items-start gap-3">
      <div className="w-10 h-10 bg-brand-50 dark:bg-brand-900/30 rounded-xl flex items-center justify-center
                      text-brand-600 flex-shrink-0">
        {icon}
      </div>
      <div>
        <p className="text-sm font-semibold text-gray-900 dark:text-gray-100">{title}</p>
        <p className="text-xs text-gray-500 dark:text-gray-400">{text}</p>
      </div>
    </div>
  );
}
