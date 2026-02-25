import { useState, useEffect } from 'react';
import { SetupStepOpenRouter } from './SetupStepOpenRouter.js';
import { SetupStepGitHub } from './SetupStepGitHub.js';
import type { SetupState } from '../hooks/useSetupState.js';

interface SetupWizardProps {
  setupState: SetupState;
  onRefreshSetupState: () => Promise<void>;
  onSetupComplete: () => void;
}

/**
 * Two-step setup wizard: OpenRouter key -> GitHub connection.
 * Wraps both steps in a centered card with a step progress indicator.
 * Skips to step 2 if OpenRouter key is already set.
 */
export function SetupWizard({ setupState, onRefreshSetupState, onSetupComplete }: SetupWizardProps) {
  const [currentStep, setCurrentStep] = useState<1 | 2>(
    setupState.openrouterKeySet ? 2 : 1
  );

  // If both are already set, signal completion immediately
  useEffect(() => {
    if (setupState.complete) {
      onSetupComplete();
    }
  }, [setupState.complete, onSetupComplete]);

  return (
    <div className="wizard-page">
      <div className="wizard-card">
        <div className="wizard-header">
          <img src="/logo-mark.svg" alt="Loom" className="wizard-brand-mark" />
          <h1 className="wizard-title">Loom Setup</h1>
          <div className="wizard-progress">
            <div className={`wizard-dot ${currentStep >= 1 ? 'filled' : ''}`} />
            <div className={`wizard-dot ${currentStep >= 2 ? 'filled' : ''}`} />
          </div>
          <p className="wizard-step-label">Step {currentStep} of 2</p>
        </div>

        {currentStep === 1 && (
          <SetupStepOpenRouter onComplete={() => setCurrentStep(2)} />
        )}

        {currentStep === 2 && (
          <SetupStepGitHub
            setupState={setupState}
            onRefreshSetupState={onRefreshSetupState}
            onComplete={onSetupComplete}
          />
        )}
      </div>
    </div>
  );
}
