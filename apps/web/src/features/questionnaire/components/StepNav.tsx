'use client';

import { Button } from '@/components/ui/button';

/** Sticky bottom navigation for a questionnaire step (mobile-first). */
export function StepNav({
  canBack,
  onBack,
  onSkip,
  submitLabel = 'Напред',
}: {
  canBack: boolean;
  onBack: () => void;
  onSkip?: () => void;
  submitLabel?: string;
}) {
  return (
    <div className="sticky bottom-0 mt-8 flex flex-wrap items-center gap-3 border-t bg-background/95 py-4 backdrop-blur supports-[backdrop-filter]:bg-background/80">
      {canBack && (
        <Button type="button" variant="outline" onClick={onBack}>
          Назад
        </Button>
      )}
      {onSkip && (
        <Button type="button" variant="ghost" onClick={onSkip}>
          Пропусни тази стъпка
        </Button>
      )}
      <Button type="submit" className="ml-auto">
        {submitLabel}
      </Button>
    </div>
  );
}
