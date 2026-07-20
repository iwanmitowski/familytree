import { describe, expect, it } from 'vitest';
import {
  buildPersonNameRow,
  normalize,
  searchTokens,
  surnameVariants,
  transliterate,
} from './index';

describe('normalize', () => {
  it('lowercases, trims, collapses whitespace, strips punctuation, keeps hyphen', () => {
    expect(normalize('  Иван,  Петров-Стоянов!! ')).toBe('иван петров-стоянов');
  });

  it('folds ѝ → и and is idempotent', () => {
    const once = normalize('ГрозданѝЯ');
    expect(once).toBe(normalize(once));
    expect(normalize('нѝ')).toBe('ни');
  });

  it('treats NFC and NFD input as equal', () => {
    const nfc = 'Йо'.normalize('NFC');
    const nfd = 'Йо'.normalize('NFD');
    expect(normalize(nfc)).toBe(normalize(nfd));
  });
});

describe('transliterate', () => {
  it('applies the 2009 streamlined table', () => {
    expect(transliterate('Живков')).toBe('zhivkov');
    expect(transliterate('Църков')).toBe('tsarkov');
    expect(transliterate('Щерев')).toBe('shterev');
  });

  it('transliterates the -ия ending as -ia', () => {
    expect(transliterate('Юлия')).toBe('yulia');
    expect(transliterate('София')).toBe('sofia');
    expect(transliterate('Мария')).toBe('maria');
  });
});

describe('surnameVariants', () => {
  it('lands Митовски / Митовска / Mitovski / Mitovsky in one shared set', () => {
    const sets = ['Митовски', 'Митовска', 'Mitovski', 'Mitovsky'].map(
      (s) => new Set(surnameVariants(s)),
    );
    // Every pair of sets shares at least one common variant.
    const common = [...sets[0]!].filter((v) => sets.every((s) => s.has(v)));
    expect(common.length).toBeGreaterThan(0);
    // The canonical Latin form is present everywhere.
    expect(sets.every((s) => s.has('mitovski'))).toBe(true);
  });

  it('does NOT collapse unrelated surnames into the same set', () => {
    const a = new Set(surnameVariants('Иванов'));
    const b = new Set(surnameVariants('Петров'));
    expect([...a].some((v) => b.has(v))).toBe(false);
  });

  it('produces gender pairs for -ов/-ова', () => {
    expect(surnameVariants('Иванов')).toContain('иванова');
    expect(surnameVariants('Иванова')).toContain('иванов');
  });
});

describe('searchTokens', () => {
  it('includes normalized and transliterated tokens, deduped and sorted', () => {
    const tokens = searchTokens('Иван Митовски');
    expect(tokens).toContain('иван');
    expect(tokens).toContain('митовски');
    expect(tokens).toContain('ivan');
    expect(tokens).toContain('mitovski');
    expect([...tokens]).toEqual([...tokens].sort());
  });
});

describe('buildPersonNameRow', () => {
  it('builds normalized + transliterated full name', () => {
    expect(buildPersonNameRow({ firstName: 'Иван', surname: 'Митовски' })).toEqual({
      normalizedName: 'иван митовски',
      transliteratedName: 'ivan mitovski',
    });
  });
});

describe('idempotency property', () => {
  const corpus = ['Иван Петров', 'ГЕОРГИ', 'мария-антоанета', '  Стоян  ', 'Ünïcode Тест'];
  it('normalize(normalize(x)) === normalize(x)', () => {
    for (const x of corpus) expect(normalize(normalize(x))).toBe(normalize(x));
  });
});
