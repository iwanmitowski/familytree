'use client';

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { STEP_TITLES } from './labels';
import { clearDraft, loadDraft, saveDraft } from './draft';

export const STEP_COUNT = STEP_TITLES.length;

/** Accumulated, loosely-typed form values across all steps. */
export type QuestionnaireDraftValues = Record<string, unknown>;

interface QuestionnaireContextValue {
  step: number;
  values: QuestionnaireDraftValues;
  draftSavedAt: number | undefined;
  restorePrompt: boolean;
  formStartedAt: number;
  /** Merge a step's validated data and advance to the next step. */
  commitStep: (patch: QuestionnaireDraftValues) => void;
  back: () => void;
  goTo: (step: number) => void;
  /** Debounced persistence of in-progress values (Записана чернова indicator). */
  autosave: (patch: QuestionnaireDraftValues) => void;
  applyDraft: () => void;
  discardDraft: () => void;
  reset: () => void;
}

const QuestionnaireContext = createContext<QuestionnaireContextValue | null>(null);

export function QuestionnaireProvider({
  children,
  initialStep = 0,
}: {
  children: ReactNode;
  initialStep?: number;
}) {
  const [step, setStep] = useState(initialStep);
  const [values, setValues] = useState<QuestionnaireDraftValues>({});
  const [draftSavedAt, setDraftSavedAt] = useState<number | undefined>(undefined);
  const [restorePrompt, setRestorePrompt] = useState(false);
  // Lazy init runs once and is pure at render time (avoids an impure Date.now()
  // call on every render).
  const [formStartedAt] = useState(() => Date.now());
  const pendingDraft = useRef<QuestionnaireDraftValues | null>(null);
  const debounceTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Draft detection is client-only (localStorage), so it must run in an effect;
  // the resulting setState on mount is intentional.
  useEffect(() => {
    const draft = loadDraft();
    if (draft && Object.keys(draft.values).length > 0) {
      pendingDraft.current = draft.values;
      // eslint-disable-next-line react-hooks/set-state-in-effect -- client-only mount detection
      setRestorePrompt(true);
    }
  }, []);

  const persist = useCallback((next: QuestionnaireDraftValues) => {
    const now = Date.now();
    saveDraft(next, now);
    setDraftSavedAt(now);
  }, []);

  const commitStep = useCallback(
    (patch: QuestionnaireDraftValues) => {
      setValues((prev) => {
        const next = { ...prev, ...patch };
        persist(next);
        return next;
      });
      setStep((s) => Math.min(s + 1, STEP_COUNT - 1));
    },
    [persist],
  );

  const back = useCallback(() => setStep((s) => Math.max(s - 1, 0)), []);
  const goTo = useCallback((target: number) => {
    setStep(Math.max(0, Math.min(target, STEP_COUNT - 1)));
  }, []);

  const autosave = useCallback(
    (patch: QuestionnaireDraftValues) => {
      if (debounceTimer.current) clearTimeout(debounceTimer.current);
      debounceTimer.current = setTimeout(() => {
        setValues((prev) => {
          const next = { ...prev, ...patch };
          persist(next);
          return next;
        });
      }, 800);
    },
    [persist],
  );

  const applyDraft = useCallback(() => {
    if (pendingDraft.current) setValues(pendingDraft.current);
    pendingDraft.current = null;
    setRestorePrompt(false);
  }, []);

  const discardDraft = useCallback(() => {
    pendingDraft.current = null;
    clearDraft();
    setRestorePrompt(false);
  }, []);

  const reset = useCallback(() => {
    clearDraft();
    setValues({});
    setStep(0);
    setDraftSavedAt(undefined);
  }, []);

  useEffect(() => {
    // Clear any pending debounce on unmount.
    return () => {
      const timer = debounceTimer.current;
      if (timer) clearTimeout(timer);
    };
  }, []);

  const ctx = useMemo<QuestionnaireContextValue>(
    () => ({
      step,
      values,
      draftSavedAt,
      restorePrompt,
      formStartedAt,
      commitStep,
      back,
      goTo,
      autosave,
      applyDraft,
      discardDraft,
      reset,
    }),
    [step, values, draftSavedAt, restorePrompt, formStartedAt, commitStep, back, goTo, autosave, applyDraft, discardDraft, reset],
  );

  return <QuestionnaireContext.Provider value={ctx}>{children}</QuestionnaireContext.Provider>;
}

export function useQuestionnaire(): QuestionnaireContextValue {
  const ctx = useContext(QuestionnaireContext);
  if (!ctx) throw new Error('useQuestionnaire must be used within QuestionnaireProvider');
  return ctx;
}
