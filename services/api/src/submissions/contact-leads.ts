import type { Kysely } from 'kysely';
import type { DB } from '../db/generated/db';

type Db = Kysely<DB>;

export interface ContactLead {
  name: string;
  contactHint: string | null;
  kind: 'participant' | 'referral';
  sourceSubmissionId: string;
}

interface PayloadShape {
  participant?: { name?: string; email?: string; preferredContact?: string; fillingForOther?: boolean };
  people?: { localKey?: string; firstName?: string; surname?: string; infoSource?: string }[];
  consents?: { consentType?: string; accepted?: boolean }[];
}

/**
 * Aggregates potential next contacts from non-spam submissions (idea.md §18
 * snowball): participants who accepted the contact consent, and every
 * "contact person" (RELATIVE_*) block. Read-only over the JSONB payload — no
 * new tables.
 */
export async function contactLeads(db: Db): Promise<{ items: ContactLead[] }> {
  const rows = await db
    .selectFrom('submissions')
    .select(['id', 'original_payload'])
    .where('status', 'in', ['pending', 'in_review', 'processed'])
    .orderBy('submitted_at', 'desc')
    .limit(500)
    .execute();

  const items: ContactLead[] = [];
  for (const row of rows) {
    const payload = (row.original_payload ?? {}) as PayloadShape;

    const contactConsent = payload.consents?.find(
      (c) => c.consentType === 'contact' && c.accepted,
    );
    if (contactConsent && payload.participant?.name) {
      items.push({
        name: payload.participant.name,
        contactHint: payload.participant.email ?? payload.participant.preferredContact ?? null,
        kind: 'participant',
        sourceSubmissionId: row.id,
      });
    }

    // Referral people carry an infoSource hint (the "може да даде повече
    // информация" block maps to RELATIVE_* with notes).
    for (const person of payload.people ?? []) {
      if (person.infoSource && (person.firstName || person.surname)) {
        items.push({
          name: [person.firstName, person.surname].filter(Boolean).join(' '),
          contactHint: person.infoSource,
          kind: 'referral',
          sourceSubmissionId: row.id,
        });
      }
    }
  }
  return { items };
}
