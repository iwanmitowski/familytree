import { describe, expect, it, beforeEach } from 'vitest';
import { questionnaireSchema, step2Schema, personBlockSchema } from './schema';
import { toSubmissionPayload } from './payload';
import { childKey, isLocalKey, parseRepeatableKey, siblingKey } from './local-keys';
import { clearDraft, loadDraft, saveDraft } from './draft';

const STARTED = 1_700_000_000_000;

function minimalValues(overrides: Record<string, unknown> = {}) {
  return {
    participantName: 'Тест Тестов',
    connectionToFamily: 'внук на рода',
    consentDataProcessing: true,
    self: { firstName: 'Иван' },
    formStartedAt: STARTED,
    website: '',
    ...overrides,
  };
}

describe('local-keys', () => {
  it('recognizes fixed and repeatable keys', () => {
    expect(isLocalKey('SELF')).toBe(true);
    expect(isLocalKey('SIBLING_2')).toBe(true);
    expect(isLocalKey('SIBLING_0')).toBe(false);
    expect(isLocalKey('NONSENSE')).toBe(false);
  });

  it('builds and parses repeatable keys', () => {
    expect(siblingKey(3)).toBe('SIBLING_3');
    expect(parseRepeatableKey('CHILD_5')).toEqual({ prefix: 'CHILD', index: 5 });
    expect(parseRepeatableKey('SELF')).toBeNull();
  });
});

describe('questionnaireSchema', () => {
  it('accepts the minimal path (steps 3–6 empty)', () => {
    const parsed = questionnaireSchema.safeParse(minimalValues());
    expect(parsed.success).toBe(true);
  });

  it('requires the data-processing consent', () => {
    const parsed = questionnaireSchema.safeParse(minimalValues({ consentDataProcessing: false }));
    expect(parsed.success).toBe(false);
  });

  it('requires participant name and self first name', () => {
    expect(questionnaireSchema.safeParse(minimalValues({ participantName: '' })).success).toBe(false);
    expect(questionnaireSchema.safeParse(minimalValues({ self: { firstName: '' } })).success).toBe(
      false,
    );
  });

  it('rejects a filled honeypot', () => {
    expect(questionnaireSchema.safeParse(minimalValues({ website: 'http://spam' })).success).toBe(
      false,
    );
  });

  it('rejects HTML characters and over-long names', () => {
    expect(step2Schema.safeParse({ firstName: 'Иван <script>' }).success).toBe(false);
    expect(step2Schema.safeParse({ firstName: 'а'.repeat(101) }).success).toBe(false);
  });

  it('enforces the birth/death year range and bounds', () => {
    expect(step2Schema.safeParse({ firstName: 'Иван', birthYear: 1799 }).success).toBe(false);
    expect(step2Schema.safeParse({ firstName: 'Иван', birthYear: 3000 }).success).toBe(false);
    expect(
      step2Schema.safeParse({ firstName: 'Иван', birthYear: 1990, deathYear: 1980 }).success,
    ).toBe(false);
    expect(
      step2Schema.safeParse({ firstName: 'Иван', birthYear: 1950, deathYear: 2010 }).success,
    ).toBe(true);
  });

  it('caps repeatable sections at 10', () => {
    const eleven = Array.from({ length: 11 }, () => ({ firstName: 'Х' }));
    const parsed = questionnaireSchema.safeParse(minimalValues({ siblings: eleven }));
    expect(parsed.success).toBe(false);
  });

  it('normalizes empty optional text to undefined', () => {
    const parsed = personBlockSchema.parse({ firstName: 'Иван', birthplace: '' });
    expect(parsed.birthplace).toBeUndefined();
  });
});

describe('toSubmissionPayload', () => {
  it('builds a minimal payload with only SELF and required consent', () => {
    const values = questionnaireSchema.parse(minimalValues());
    const payload = toSubmissionPayload(values, STARTED + 90_000);
    expect(payload.payloadVersion).toBe(1);
    expect(payload.people.map((p) => p.localKey)).toEqual(['SELF']);
    expect(payload.relationships).toEqual([]);
    expect(payload.meta.durationMs).toBe(90_000);
    expect(payload.consents.find((c) => c.consentType === 'data_processing')?.accepted).toBe(true);
    expect(payload.consents.find((c) => c.consentType === 'contact')?.accepted).toBe(false);
  });

  it('assembles people and derives relationships from a full fixture', () => {
    const values = questionnaireSchema.parse(
      minimalValues({
        father: { firstName: 'Петър', surname: 'Митовски' },
        mother: { firstName: 'Мария', birthSurname: 'Иванова' },
        paternalGrandfather: { firstName: 'Георги' },
        siblings: [{ firstName: 'Стоян' }],
        children: [{ firstName: 'Елена' }],
        partners: [{ firstName: 'Анна' }],
        unclesAunts: [{ firstName: 'Тодор' }],
        contactPerson: { firstName: 'Баба', nickname: 'знае всичко' },
        consentContact: true,
      }),
    );
    const payload = toSubmissionPayload(values, STARTED);

    const keys = payload.people.map((p) => p.localKey);
    expect(keys).toEqual([
      'SELF',
      'FATHER',
      'MOTHER',
      'PATERNAL_GRANDFATHER',
      'SIBLING_1',
      'CHILD_1',
      'PARTNER_1',
      'RELATIVE_1',
      'RELATIVE_2',
    ]);

    const rels = payload.relationships;
    expect(rels).toContainEqual({ fromLocalKey: 'SELF', toLocalKey: 'FATHER', type: 'parent' });
    expect(rels).toContainEqual({
      fromLocalKey: 'FATHER',
      toLocalKey: 'PATERNAL_GRANDFATHER',
      type: 'parent',
    });
    expect(rels).toContainEqual({ fromLocalKey: 'SELF', toLocalKey: siblingKey(1), type: 'sibling' });
    expect(rels).toContainEqual({ fromLocalKey: 'SELF', toLocalKey: childKey(1), type: 'child' });
    expect(rels).toContainEqual({ fromLocalKey: 'SELF', toLocalKey: 'PARTNER_1', type: 'partner' });
    // Grandmother absent → no edge to a missing person.
    expect(rels.find((r) => r.toLocalKey === 'PATERNAL_GRANDMOTHER')).toBeUndefined();
    expect(payload.consents.find((c) => c.consentType === 'contact')?.accepted).toBe(true);
  });

  it('skips empty person blocks', () => {
    const values = questionnaireSchema.parse(
      minimalValues({ father: {}, siblings: [{ firstName: '' }] }),
    );
    const payload = toSubmissionPayload(values, STARTED);
    expect(payload.people.map((p) => p.localKey)).toEqual(['SELF']);
  });
});

describe('draft persistence', () => {
  beforeEach(() => clearDraft());

  it('round-trips a draft', () => {
    saveDraft({ participantName: 'Иван', self: { firstName: 'Иван' } }, 123);
    const loaded = loadDraft();
    expect(loaded?.savedAt).toBe(123);
    expect(loaded?.values.participantName).toBe('Иван');
  });

  it('discards a corrupt draft', () => {
    window.localStorage.setItem('familytree.questionnaire.draft.v1', '{not valid json');
    expect(loadDraft()).toBeUndefined();
    expect(window.localStorage.getItem('familytree.questionnaire.draft.v1')).toBeNull();
  });

  it('returns undefined when no draft exists', () => {
    expect(loadDraft()).toBeUndefined();
  });
});
