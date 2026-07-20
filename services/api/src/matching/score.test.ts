import { describe, expect, it } from 'vitest';
import { score, type PersonMatchContext } from './score';

const base: PersonMatchContext = {
  normalizedName: 'иван митовски',
  birthSurname: 'митовски',
  birthYearFrom: 1950,
  birthYearTo: 1950,
  birthplaceNormalized: 'софия',
};

describe('score', () => {
  it('scores an exact homonym with a matching year high, with the right reasons', () => {
    const result = score(base, { ...base });
    expect(result.score).toBeGreaterThanOrEqual(60);
    const fields = result.reasons.map((r) => r.field);
    expect(fields).toContain('normalizedName');
    expect(fields).toContain('birthYear');
    const nameReason = result.reasons.find((r) => r.field === 'normalizedName')!;
    expect(nameReason.description).toBe('Пълно съвпадение на името');
    expect(nameReason.score).toBe(35);
  });

  it('gives a mid score for the same name but a different generation', () => {
    const result = score(base, { ...base, birthYearFrom: 1980, birthYearTo: 1980 });
    // Name (35) + surname (10) + birthplace (10) = 55, no birth-year points.
    expect(result.score).toBe(55);
    expect(result.reasons.find((r) => r.field === 'birthYear')).toBeUndefined();
  });

  it('reports a one-year difference explicitly', () => {
    const result = score(base, { ...base, birthYearFrom: 1951, birthYearTo: 1951 });
    const year = result.reasons.find((r) => r.field === 'birthYear')!;
    expect(year.description).toBe('Разлика от една година');
    expect(year.score).toBe(10);
  });

  it('scores an unrelated person below the threshold', () => {
    const result = score(base, {
      normalizedName: 'георги петров',
      birthSurname: 'петров',
      birthYearFrom: 1900,
      birthYearTo: 1900,
      birthplaceNormalized: 'варна',
    });
    expect(result.score).toBeLessThan(30);
  });

  it('adds points for partial name overlap', () => {
    const result = score(base, { normalizedName: 'иван георгиев' });
    const name = result.reasons.find((r) => r.field === 'normalizedName')!;
    expect(name.description).toBe('Частично съвпадение на името');
    expect(name.score).toBeGreaterThan(0);
    expect(name.score).toBeLessThan(35);
  });

  it('rewards shared parents, partners, children and nickname', () => {
    const result = score(
      { normalizedName: 'иван', parentNames: ['петър'], partnerNames: ['мария'], childrenNames: ['анна'], nickname: 'ванката' },
      { normalizedName: 'иван', parentNames: ['петър'], partnerNames: ['мария'], childrenNames: ['анна'], nickname: 'ванката' },
    );
    const fields = result.reasons.map((r) => r.field);
    expect(fields).toEqual(expect.arrayContaining(['parents', 'partner', 'children', 'nickname']));
  });

  it('caps the score at 100', () => {
    const rich: PersonMatchContext = {
      normalizedName: 'иван митовски',
      birthSurname: 'митовски',
      nickname: 'ванката',
      birthYearFrom: 1950,
      birthYearTo: 1950,
      birthplaceNormalized: 'софия',
      parentNames: ['петър', 'мария'],
      partnerNames: ['анна'],
      childrenNames: ['стоян'],
    };
    expect(score(rich, rich).score).toBe(100);
  });
});
