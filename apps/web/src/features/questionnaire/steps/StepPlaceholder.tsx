'use client';

import { useQuestionnaire } from '../store';
import { StepNav } from '../components/StepNav';

/** Temporary placeholder for steps implemented in Task 15 (5–7). */
export function StepPlaceholder({ title }: { title: string }) {
  const { commitStep, back } = useQuestionnaire();
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        commitStep({});
      }}
    >
      <p className="text-sm text-muted-foreground">
        „{title}“ ще бъде добавена скоро.
      </p>
      <StepNav canBack onBack={back} />
    </form>
  );
}
