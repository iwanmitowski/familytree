'use client';

import { STEP_TITLES } from './labels';
import { useQuestionnaire } from './store';
import { Stepper } from './components/Stepper';
import { Step1Participant } from './steps/Step1Participant';
import { Step2Self } from './steps/Step2Self';
import { Step3Parents } from './steps/Step3Parents';
import { Step4Grandparents } from './steps/Step4Grandparents';
import { Step5Relatives } from './steps/Step5Relatives';
import { Step6Origin } from './steps/Step6Origin';
import { Step7Review } from './steps/Step7Review';
import { Button } from '@/components/ui/button';

function DraftSavedIndicator({ savedAt }: { savedAt: number | undefined }) {
  if (!savedAt) return null;
  const time = new Date(savedAt).toLocaleTimeString('bg-BG', {
    hour: '2-digit',
    minute: '2-digit',
  });
  return (
    <p className="mb-2 text-xs text-muted-foreground" role="status">
      Записана чернова · {time}
    </p>
  );
}

function RestoreBanner() {
  const { applyDraft, discardDraft } = useQuestionnaire();
  return (
    <div className="mb-6 rounded-md border bg-muted/40 p-4" role="dialog" aria-label="Продължаване от чернова">
      <p className="text-sm">Открихме незавършена чернова. Искате ли да продължите от нея?</p>
      <div className="mt-3 flex gap-3">
        <Button size="sm" onClick={applyDraft}>
          Продължи от черновата
        </Button>
        <Button size="sm" variant="outline" onClick={discardDraft}>
          Започни отначало
        </Button>
      </div>
    </div>
  );
}

export function QuestionnaireForm() {
  const { step, draftSavedAt, restorePrompt } = useQuestionnaire();

  // Gate the form behind the restore prompt so the step forms mount with the
  // correct default values (either the applied draft or a clean slate).
  if (restorePrompt) {
    return (
      <div className="mx-auto max-w-2xl px-4 py-8">
        <RestoreBanner />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-2xl px-4 py-8">
      <Stepper step={step} />
      <DraftSavedIndicator savedAt={draftSavedAt} />
      <h1 className="mb-6 text-2xl font-semibold tracking-tight">{STEP_TITLES[step]}</h1>

      {step === 0 && <Step1Participant />}
      {step === 1 && <Step2Self />}
      {step === 2 && <Step3Parents />}
      {step === 3 && <Step4Grandparents />}
      {step === 4 && <Step5Relatives />}
      {step === 5 && <Step6Origin />}
      {step === 6 && <Step7Review />}
    </div>
  );
}
