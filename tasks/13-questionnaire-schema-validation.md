# Task 13: Questionnaire schemas, payload model, draft persistence

**Depends on:** 08 · **Size:** M · **Spec:** idea.md §9 (all steps), §6 (anti-abuse fields), §8 (submission_people local keys)

## Goal
The typed core of the questionnaire: Zod schemas for all 7 steps, the canonical submission payload format, local-key model, and client-side draft persistence. UI comes in Tasks 14–15; this task is logic + tests only.

## Requirements
1. `apps/web/src/features/questionnaire/` with:
   - `local-keys.ts`: the local key model per idea.md §8 — literals `SELF`, `FATHER`, `MOTHER`, `PATERNAL_GRANDFATHER`, `PATERNAL_GRANDMOTHER`, `MATERNAL_GRANDFATHER`, `MATERNAL_GRANDMOTHER` + factories `SIBLING_n`, `CHILD_n`, `PARTNER_n`, `RELATIVE_n`; parse/validate helpers.
   - `schema.ts`: Zod schemas per step (idea.md §9): step1 participant (names, connection to the family, branch origin, optional email with format check, preferred contact, required data-processing consent), step2 self (**no exact birth date for living people** — year or approximate year only), step3 parents (father/mother blocks, each optional; relationship type `biological|adoptive|step|unknown`; "откъде е известна информацията"), step4 four grandparent blocks, step5 repeatable relatives (siblings, children, partners, uncles/aunts, others, contact person; cap 10 per section), step6 origin questions **plus the family-materials question** („Пазите ли стари снимки, документи или писма, свързани с рода?" — enum `yes|no|unsure` + optional free text „какви"; uploads stay post-MVP (Task 38), this only maps who has materials for later collection), step7 consents — five separate checkboxes (`data_processing` required; `contact`, `family_visibility`, `public_display`, `media_usage` optional) with `CONSENT_VERSION` constant.
   - Common field rules: max lengths (names ≤100, free text ≤2000), years within 1800..current year with `from ≤ to`, trim, and a refinement rejecting `<` and `>` in plain text fields (idea.md §6 "no HTML").
   - **Minimal-path rule:** step 3–6 schemas must validate when left completely empty — a submission with only step 1, step 2 and the required consent is valid (a partial submission beats an abandoned one). The UI skip actions (Tasks 14–15) rely on this.
   - Anti-abuse fields: honeypot field named `website` (must be empty) and `formStartedAt` timestamp (idea.md §6).
2. `payload.ts`: `toSubmissionPayload(formData)` → deterministic versioned payload `{payloadVersion: 1, participant, people: [{localKey, ...fields}], relationships: [{fromLocalKey, toLocalKey, type, notes?}], origin, consents, meta: {startedAt, durationMs}}`. Relationship derivation: SELF↔parents (`parent`), parents↔grandparents (`parent`), SELF↔siblings (`sibling`), SELF↔children (`child`), SELF↔partners (`partner`), others (`other` + notes). All Bulgarian labels for enums live in `labels.ts` (single source for the UI).
3. `draft.ts`: localStorage persistence — versioned key, save/restore validated through a lenient (partial) Zod schema, corrupt drafts discarded silently, `clearDraft()` after submit.
4. Unit tests (Vitest): required consent enforced; year range and cross-field rules; max lengths; minimal path (steps 3–6 completely empty) validates; honeypot; local-key factories; payload assembly snapshot for a fully-filled fixture; draft save→restore roundtrip; corrupt draft ignored.

## Acceptance criteria
- Types compile strictly; the payload snapshot is stable and matches the shape Task 16's server-side validation will mirror.

## Verification
- Standard web verification.
- Commit as `task-13: questionnaire schemas and payload model`.
