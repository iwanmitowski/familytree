export type SubmissionStatus =
  | 'draft'
  | 'pending'
  | 'in_review'
  | 'processed'
  | 'rejected'
  | 'spam';

export interface SubmissionListItem {
  id: string;
  status: SubmissionStatus;
  participantName: string | null;
  campaign: string | null;
  peopleCount: number;
  hasMaterials: boolean;
  submittedAt: string | null;
}

export interface SubmissionPerson {
  id: string;
  localKey: string;
  first_name?: string | null;
  middle_name?: string | null;
  surname?: string | null;
  nickname?: string | null;
  birth_year_from?: number | null;
  birth_year_to?: number | null;
  death_year_from?: number | null;
  death_year_to?: number | null;
  birthplace_text?: string | null;
  living_status?: string | null;
  resolution_status?: string | null;
  matched_person_id?: string | null;
  [key: string]: unknown;
}

export interface SubmissionDetail extends SubmissionListItem {
  originalPayload: unknown;
  clientFingerprintPrefix: string | null;
  spamReason: string | null;
  processingStartedAt: string | null;
  processedAt: string | null;
  rejectedAt: string | null;
  people: SubmissionPerson[];
  relationships: { from_local_key: string; to_local_key: string; relationship_type: string; notes?: string | null }[];
  consents: { consent_type: string; consent_version: string; accepted: boolean }[];
}

export interface Invite {
  id: string;
  recipientLabel: string;
  campaign: string | null;
  expiresAt: string | null;
  maxSubmissions: number;
  usedSubmissions: number;
  revokedAt: string | null;
  expired: boolean;
  createdAt: string;
}

export interface InviteWithToken extends Invite {
  token: string;
}

export interface ContactLead {
  name: string;
  contactHint: string | null;
  kind: 'participant' | 'referral';
  sourceSubmissionId: string;
}

export const STATUS_LABELS: Record<SubmissionStatus, string> = {
  draft: 'Чернова',
  pending: 'Чакаща',
  in_review: 'В преглед',
  processed: 'Обработена',
  rejected: 'Отхвърлена',
  spam: 'Спам',
};

export const RESOLUTION_LABELS: Record<string, string> = {
  pending: 'Нерешен',
  created: 'Създаден',
  linked: 'Свързан',
  deferred: 'Отложен',
  ignored: 'Игнориран',
};

// --- Review workspace (task-27) ---

export interface MatchReason {
  field: string;
  score: number;
  description: string;
}

export interface RankedCandidate {
  id: string;
  canonicalPersonId: string;
  score: number;
  reasons: MatchReason[];
  status: string;
  person: { id: string; label: string; birthYear: number | null };
}

export interface SuggestionEndpoint {
  localKey: string;
  personId: string | null;
  label: string;
}

export interface SuggestedRelationship {
  kind: 'parent_child' | 'union' | 'sibling_hint';
  viaLocalKeys: [string, string];
  a: SuggestionEndpoint;
  b: SuggestionEndpoint;
  relationshipType?: string;
  status: 'ready' | 'missing_person' | 'already_exists';
  missingLocalKeys: string[];
}
