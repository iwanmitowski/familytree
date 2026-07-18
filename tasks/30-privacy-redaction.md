# Task 30: PersonRedactionService + public/admin views

**Depends on:** 29 · **Size:** M · **Spec:** idea.md §15 (entire section — normative), §23 (privacy redaction tests)

## Goal
One central redaction service deciding what any viewer may see about any person, applied consistently across tree projection, people reads, and relationship paths. Privacy logic must not be scattered across handlers (idea.md §15).

## Requirements
1. `src/privacy` `PersonRedactionService` — single entry point `redact(person: PersonView, viewer: ViewerContext): RedactedPerson` where `viewer.view ∈ {admin, public}` (a `family` tier is defined in the enum for the future but unused — document):
   - **admin**: everything;
   - **public + deceased + privacy_level ∈ {family, public}**: name, year ranges (honest precision), settlement-level places, source count. Never: notes, contact data, internal source details (idea.md §15 list);
   - **public + living (any privacy_level — policy decision: living people are never publicly identifiable, even if flagged public; document in `docs/security.md`)**: label „Жив член на семейството", `birthDecade` („1980-те") when a birth year exists, everything else null; node keeps id/generation so the tree shape survives;
   - **public + privacy_level = private + deceased**: masked like living (label „Член на семейството").
   - Forbidden-field list from idea.md §15 (email, телефон, точна дата, адрес, документи, notes, internal sources) is encoded as a test constant.
2. View resolution at the API boundary: `view=admin` requires actor role `admin` (else forced to `public`); the BFF public routes always request `view=public`.
3. Apply the service in: tree projection nodes (Task 29), `GET /people` list/detail when `view=public`, relationship-path results (mask names inside `path`/`commonAncestors` and keep only the label + confidence for public).
4. Public BFF routes now exposed: `GET /api/tree/[personId]` and `GET /api/relationship` (idea.md §17) — no session required, always `view=public`, actor `{id:'public', role:'public'}`.
5. Update OpenAPI (`view` param semantics + redacted schema variants).

## Acceptance criteria
- Redaction matrix (living/deceased × private/family/public × admin/public view) fully covered by table tests; a deep-key scan test proves no forbidden field name appears anywhere in a public tree/person/path JSON for a rich fixture (idea.md §23 „private person masking").

## Verification
- Unit matrix tests + the deep-scan test; integration test: public tree of a fixture with living people shows masked nodes.
- Standard API verification + `npm run test:integration -w @familytree/api`.
- Commit as `task-30: privacy redaction service`.
