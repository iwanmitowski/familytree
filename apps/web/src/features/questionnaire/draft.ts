/**
 * Draft persistence for the questionnaire (idea.md §14 draft restore). Stored
 * in localStorage under a versioned key; restored through a lenient partial
 * parse so a schema change or corruption never crashes the form — a bad draft
 * is silently discarded.
 */
export const DRAFT_STORAGE_KEY = 'familytree.questionnaire.draft.v1';

export interface DraftEnvelope {
  savedAt: number;
  values: Record<string, unknown>;
}

function storage(): Storage | undefined {
  try {
    return typeof window !== 'undefined' ? window.localStorage : undefined;
  } catch {
    return undefined;
  }
}

export function saveDraft(values: Record<string, unknown>, now = Date.now()): void {
  const store = storage();
  if (!store) return;
  try {
    const envelope: DraftEnvelope = { savedAt: now, values };
    store.setItem(DRAFT_STORAGE_KEY, JSON.stringify(envelope));
  } catch {
    // Quota or serialization failure — drafts are best-effort.
  }
}

export function loadDraft(): DraftEnvelope | undefined {
  const store = storage();
  if (!store) return undefined;
  const raw = store.getItem(DRAFT_STORAGE_KEY);
  if (!raw) return undefined;
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (
      parsed &&
      typeof parsed === 'object' &&
      'values' in parsed &&
      typeof (parsed as DraftEnvelope).savedAt === 'number' &&
      (parsed as DraftEnvelope).values &&
      typeof (parsed as DraftEnvelope).values === 'object'
    ) {
      return parsed as DraftEnvelope;
    }
    // Shape unexpected — treat as corrupt.
    clearDraft();
    return undefined;
  } catch {
    clearDraft();
    return undefined;
  }
}

export function clearDraft(): void {
  storage()?.removeItem(DRAFT_STORAGE_KEY);
}
