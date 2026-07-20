// Shapes returned by the admin people BFF routes (mirror the Oracle payload:
// person-level fields are camelCase, DB rows keep snake_case).

export interface PersonSummary {
  id: string;
  label: string;
  livingStatus: string;
  privacyLevel: string;
  birthYear: number | null;
  deathYear: number | null;
  merged: boolean;
}

export interface PersonName {
  id: string;
  first_name: string | null;
  middle_name: string | null;
  surname: string | null;
  birth_surname: string | null;
  nickname: string | null;
  name_type: string;
  is_preferred: boolean;
}

export interface PersonEvent {
  id: string;
  event_type: string;
  year_from: number | null;
  year_to: number | null;
  date_precision: string;
  place_label: string | null;
  value: string | null;
}

export interface RelationshipEdge {
  id: string;
  parent_id: string;
  child_id: string;
  relationship_type: string;
  verification_status: string;
  confidence: number | null;
  family_union_id: string | null;
  counterpartId: string;
  counterpartLabel: string;
}

export interface UnionView {
  id: string;
  unionType: string;
  partnerIds: string[];
  partners: { id: string; label: string }[];
}

export interface MergeHistoryEntry {
  id: string;
  source_person_id: string;
  target_person_id: string;
  actor_id: string;
  reason: string;
  created_at: string;
}

export interface PersonAggregate {
  id: string;
  label: string;
  livingStatus: string;
  privacyLevel: string;
  notes: string | null;
  mergedIntoPersonId: string | null;
  names: PersonName[];
  events: PersonEvent[];
  parents: RelationshipEdge[];
  children: RelationshipEdge[];
  unions: UnionView[];
  mergeHistory: MergeHistoryEntry[];
  sourceCount: number;
}

export interface PersonEvidenceItem {
  id: string;
  subjectType: string;
  subjectId: string;
  assertion: string;
  stance: string;
  confidence: number | null;
  notes: string | null;
  sourceId: string;
  sourceTitle: string;
  sourceType: string;
}

/** 409 envelope returned when a person was merged away. */
export interface MergedEnvelope {
  mergedIntoPersonId: string;
}
