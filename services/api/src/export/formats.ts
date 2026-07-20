import type { ExportData } from './data';

const MONTHS = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];

interface EventLike {
  event_type: string;
  year_from: number | null;
  year_to: number | null;
  date_from: Date | string | null;
  date_precision: string;
}

/**
 * GEDCOM date honoring precision (idea.md §8): exact -> DD MON YYYY, month ->
 * MON YYYY, year -> YYYY, approximate -> ABT YYYY, range -> BET YYYY AND YYYY,
 * unknown -> omitted (never a fabricated date).
 */
export function gedcomDate(ev: EventLike): string | null {
  const d = ev.date_from ? new Date(ev.date_from) : null;
  switch (ev.date_precision) {
    case 'exact':
      return d ? `${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]} ${d.getUTCFullYear()}` : null;
    case 'month':
      return d ? `${MONTHS[d.getUTCMonth()]} ${d.getUTCFullYear()}` : null;
    case 'year':
      return ev.year_from != null ? `${ev.year_from}` : null;
    case 'approximate':
      return ev.year_from != null ? `ABT ${ev.year_from}` : null;
    case 'range':
      return ev.year_from != null && ev.year_to != null ? `BET ${ev.year_from} AND ${ev.year_to}` : null;
    default:
      return null;
  }
}

function xref(prefix: string, id: string, map: Map<string, string>): string {
  let x = map.get(id);
  if (!x) {
    x = `@${prefix}${map.size + 1}@`;
    map.set(id, x);
  }
  return x;
}

/** GEDCOM 5.5.1. `publicOnly` already filtered living people from the data. */
export function toGedcom(data: ExportData): string {
  const indi = new Map<string, string>();
  const fam = new Map<string, string>();
  const lines: string[] = [];

  lines.push('0 HEAD', '1 SOUR familytree', '1 GEDC', '2 VERS 5.5.1', '2 FORM LINEAGE-LINKED', '1 CHAR UTF-8');

  const preferred = new Map<string, (typeof data.names)[number]>();
  for (const n of data.names) {
    if (n.name_type === 'primary' && n.is_preferred) preferred.set(n.person_id, n);
  }
  const birthByPerson = new Map<string, (typeof data.events)[number]>();
  const deathByPerson = new Map<string, (typeof data.events)[number]>();
  for (const e of data.events) {
    if (e.event_type === 'birth' && !birthByPerson.has(e.person_id)) birthByPerson.set(e.person_id, e);
    if (e.event_type === 'death' && !deathByPerson.has(e.person_id)) deathByPerson.set(e.person_id, e);
  }

  for (const p of data.people) {
    const id = xref('I', p.id, indi);
    lines.push(`0 ${id} INDI`);
    const name = preferred.get(p.id);
    const given = [name?.first_name, name?.middle_name].filter(Boolean).join(' ');
    const surname = name?.surname ?? '';
    lines.push(`1 NAME ${given} /${surname}/`.trimEnd());
    const birth = birthByPerson.get(p.id);
    if (birth) {
      lines.push('1 BIRT');
      const d = gedcomDate(birth);
      if (d) lines.push(`2 DATE ${d}`);
    }
    const death = deathByPerson.get(p.id);
    if (death || p.living_status === 'deceased') {
      lines.push('1 DEAT');
      const d = death ? gedcomDate(death) : null;
      if (d) lines.push(`2 DATE ${d}`);
    }
  }

  // Families: one FAM per union; plus synthetic FAMs for unionless parent pairs.
  const partnersByUnion = new Map<string, string[]>();
  for (const up of data.unionPartners) {
    const arr = partnersByUnion.get(up.union_id) ?? [];
    arr.push(up.person_id);
    partnersByUnion.set(up.union_id, arr);
  }
  const childrenByUnion = new Map<string, string[]>();
  const unionlessPairs = new Map<string, { parents: Set<string>; children: string[] }>();
  for (const e of data.parentChild) {
    if (e.family_union_id) {
      const arr = childrenByUnion.get(e.family_union_id) ?? [];
      if (!arr.includes(e.child_id)) arr.push(e.child_id);
      childrenByUnion.set(e.family_union_id, arr);
    } else {
      const key = `child:${e.child_id}`;
      const entry = unionlessPairs.get(key) ?? { parents: new Set(), children: [e.child_id] };
      entry.parents.add(e.parent_id);
      unionlessPairs.set(key, entry);
    }
  }

  for (const u of data.unions) {
    if (!indi.size) break;
    const famId = xref('F', u.id, fam);
    lines.push(`0 ${famId} FAM`);
    const partners = partnersByUnion.get(u.id) ?? [];
    partners.forEach((pid, i) => {
      if (indi.has(pid)) lines.push(`1 ${i === 0 ? 'HUSB' : 'WIFE'} ${indi.get(pid)}`);
    });
    for (const cid of childrenByUnion.get(u.id) ?? []) {
      if (indi.has(cid)) lines.push(`1 CHIL ${indi.get(cid)}`);
    }
  }
  for (const [key, entry] of unionlessPairs) {
    const famId = xref('F', key, fam);
    lines.push(`0 ${famId} FAM`);
    [...entry.parents].forEach((pid, i) => {
      if (indi.has(pid)) lines.push(`1 ${i === 0 ? 'HUSB' : 'WIFE'} ${indi.get(pid)}`);
    });
    for (const cid of entry.children) if (indi.has(cid)) lines.push(`1 CHIL ${indi.get(cid)}`);
  }

  for (const s of data.sources) {
    lines.push(`0 @S${s.id.slice(0, 8)}@ SOUR`, `1 TITL ${s.title}`);
  }

  lines.push('0 TRLR');
  return lines.join('\n') + '\n';
}

export function toJsonExport(data: ExportData): string {
  return (
    JSON.stringify(
      {
        exportVersion: 1,
        people: data.people,
        names: data.names,
        events: data.events,
        places: data.places,
        parentChildRelationships: data.parentChild,
        unions: data.unions,
        unionPartners: data.unionPartners,
        sources: data.sources,
      },
      null,
      2,
    ) + '\n'
  );
}

const BOM = '﻿';

function csvCell(value: unknown): string {
  const s = value == null ? '' : String(value);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/** people.csv with a UTF-8 BOM so Excel opens Cyrillic correctly. */
export function toCsvPeople(data: ExportData): string {
  const preferred = new Map<string, (typeof data.names)[number]>();
  for (const n of data.names) if (n.name_type === 'primary' && n.is_preferred) preferred.set(n.person_id, n);
  const birth = new Map<string, number | null>();
  const death = new Map<string, number | null>();
  for (const e of data.events) {
    if (e.event_type === 'birth' && !birth.has(e.person_id)) birth.set(e.person_id, e.year_from);
    if (e.event_type === 'death' && !death.has(e.person_id)) death.set(e.person_id, e.year_from);
  }
  const rows = [['id', 'name', 'birth_year', 'death_year', 'living', 'privacy']];
  for (const p of data.people) {
    const n = preferred.get(p.id);
    rows.push([
      p.id,
      [n?.first_name, n?.surname].filter(Boolean).join(' '),
      String(birth.get(p.id) ?? ''),
      String(death.get(p.id) ?? ''),
      p.living_status,
      p.privacy_level,
    ]);
  }
  return BOM + rows.map((r) => r.map(csvCell).join(',')).join('\n') + '\n';
}

export function toCsvRelationships(data: ExportData): string {
  const rows = [['parent_id', 'child_id', 'type', 'verification', 'union_id']];
  for (const e of data.parentChild) {
    rows.push([e.parent_id, e.child_id, e.relationship_type, e.verification_status, e.family_union_id ?? '']);
  }
  return BOM + rows.map((r) => r.map(csvCell).join(',')).join('\n') + '\n';
}
