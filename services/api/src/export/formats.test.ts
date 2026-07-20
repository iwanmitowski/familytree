import { describe, expect, it } from 'vitest';
import { gedcomDate, toCsvPeople, toGedcom, toJsonExport } from './formats';
import type { ExportData } from './data';

function fixture(): ExportData {
  return {
    people: [
      { id: 'p1', living_status: 'deceased', privacy_level: 'public', notes: null, merged_into_person_id: null, deleted_at: null, created_at: new Date(0), updated_at: new Date(0) },
      { id: 'p2', living_status: 'deceased', privacy_level: 'family', notes: null, merged_into_person_id: null, deleted_at: null, created_at: new Date(0), updated_at: new Date(0) },
    ],
    names: [
      { id: 'n1', person_id: 'p1', first_name: 'Иван', middle_name: null, surname: 'Митовски', birth_surname: null, nickname: null, normalized_name: 'иван митовски', transliterated_name: 'ivan mitovski', name_type: 'primary', is_preferred: true, source_id: null, created_at: new Date(0) },
      { id: 'n2', person_id: 'p2', first_name: 'Дете', middle_name: null, surname: 'Митовски', birth_surname: null, nickname: null, normalized_name: 'дете митовски', transliterated_name: 'dete mitovski', name_type: 'primary', is_preferred: true, source_id: null, created_at: new Date(0) },
    ],
    events: [
      { id: 'e1', person_id: 'p1', event_type: 'birth', place_id: null, value: null, date_from: null, date_to: null, year_from: 1950, year_to: 1950, date_precision: 'year', created_at: new Date(0) },
    ],
    places: [],
    parentChild: [
      { id: 'pc1', parent_id: 'p1', child_id: 'p2', relationship_type: 'biological', family_union_id: null, verification_status: 'confirmed', confidence: null, created_at: new Date(0), updated_at: new Date(0) },
    ],
    unions: [],
    unionPartners: [],
    sources: [{ id: 'source-1', source_type: 'questionnaire', title: 'Въпросник', description: null, submission_id: null, created_at: new Date(0) }],
  };
}

describe('gedcomDate', () => {
  it('honors precision and never fabricates a date', () => {
    expect(gedcomDate({ event_type: 'birth', year_from: 1950, year_to: 1950, date_from: null, date_precision: 'year' })).toBe('1950');
    expect(gedcomDate({ event_type: 'birth', year_from: 1950, year_to: null, date_from: null, date_precision: 'approximate' })).toBe('ABT 1950');
    expect(gedcomDate({ event_type: 'birth', year_from: 1948, year_to: 1952, date_from: null, date_precision: 'range' })).toBe('BET 1948 AND 1952');
    expect(gedcomDate({ event_type: 'birth', year_from: null, year_to: null, date_from: null, date_precision: 'unknown' })).toBeNull();
    expect(gedcomDate({ event_type: 'birth', year_from: 1950, year_to: 1950, date_from: '1950-03-15T00:00:00Z', date_precision: 'exact' })).toBe('15 MAR 1950');
  });
});

describe('toGedcom', () => {
  const ged = toGedcom(fixture());

  it('is structurally valid (every line starts with a level number and a tag)', () => {
    for (const line of ged.trimEnd().split('\n')) {
      expect(line).toMatch(/^\d+ (@[^@]+@ )?[A-Z]{3,4}( .*)?$/);
    }
  });

  it('includes HEAD/TRLR, an INDI with a slashed surname, and a birth date', () => {
    expect(ged).toContain('0 HEAD');
    expect(ged).toContain('2 VERS 5.5.1');
    expect(ged).toContain('1 NAME Иван /Митовски/');
    expect(ged).toContain('1 BIRT');
    expect(ged).toContain('2 DATE 1950');
    expect(ged.trimEnd().endsWith('0 TRLR')).toBe(true);
  });

  it('is deterministic', () => {
    expect(toGedcom(fixture())).toBe(ged);
  });
});

describe('toJsonExport', () => {
  it('is a flat versioned envelope', () => {
    const json = JSON.parse(toJsonExport(fixture())) as { exportVersion: number; people: unknown[]; parentChildRelationships: unknown[] };
    expect(json.exportVersion).toBe(1);
    expect(json.people).toHaveLength(2);
    expect(json.parentChildRelationships).toHaveLength(1);
  });
});

describe('toCsvPeople', () => {
  it('starts with a UTF-8 BOM and a header, and includes rows', () => {
    const csv = toCsvPeople(fixture());
    expect(csv.charCodeAt(0)).toBe(0xfeff);
    expect(csv).toContain('id,name,birth_year,death_year,living,privacy');
    expect(csv).toContain('Иван Митовски');
    expect(csv).toContain('1950');
  });
});
