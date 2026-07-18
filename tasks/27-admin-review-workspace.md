# Task 27: Admin review workspace — resolve people, confirm relationships

**Depends on:** 20, 26 · **Size:** L · **Spec:** idea.md §7 (promotion flow), §10 (admin choices), §16, §8 (resolution_status)

## Goal
The heart of the moderation workflow: on a submission in review, resolve every described person (create / link / defer / ignore) with match candidates on screen, then confirm the proposed family relationships, then mark the submission processed.

## Requirements — API
1. `GET /v1/internal/submissions/{id}/suggested-relationships`: maps `submission_relationships` + the standard local-key semantics into **canonical edge suggestions** using resolved `matched_person_id`s: SELF—FATHER/MOTHER → parent edges; FATHER—PATERNAL_GRANDFATHER/…MOTHER → parent edges; SELF—SIBLING_n → *shared-parent suggestion* (never a stored sibling edge — idea.md §11: siblings derive from parents); SELF—CHILD_n → parent edge (SELF as parent); SELF—PARTNER_n → union suggestion. Response items: `{kind: 'parent_child'|'union', fromPersonId?, toPersonId?, viaLocalKeys, status: ready|missing_person|already_exists}` (`already_exists` checked against current edges).
2. `POST /v1/internal/submissions/{id}/complete`: guard — submission `in_review` and **no** submission person left `resolution_status='pending'` (deferred/ignored are acceptable); sets `processed` + `processed_at`; audit. Update OpenAPI (+ the ignore/defer resolution endpoints below).
3. `POST /v1/internal/submission-people/{id}/defer` and `/ignore` `{reason?}` — set resolution_status accordingly; audit.

## Requirements — BFF
4. Routes: find-matches, create-person, link-person, defer, ignore, suggested-relationships, complete — proxied with session actor.

## Requirements — Admin UI (Bulgarian), on `/admin/submissions/[id]`
5. Tab „Резолюция": one card per submission person (SELF, FATHER, …): staging summary (имена, години, места) + resolution state badge; „Намери съвпадения" → ranked candidates with score bar, reason chips in Bulgarian, and a link to the person; per idea.md §10 exactly four actions: **„Създай нов човек"** (confirm dialog → create-person), **„Свържи със съществуващ"** (select a candidate or use the person-picker → link-person), **„Остави за по-късно"** (defer), **„Игнорирай"** (ignore + optional reason). Resolved cards show the linked/created person.
6. Tab „Връзки": suggested relationships list; `ready` items have „Потвърди" (creates the parent-child edge as `confirmed`, or the union, via existing endpoints; then attaches questionnaire evidence) and „Пропусни"; `missing_person` items explain which local key is unresolved; `already_exists` items are shown checked. Sibling suggestions render as „общи родители" hints, not edges.
7. Header action „Маркирай като обработена" — enabled only when the API guard would pass; success returns to the inbox with a toast.

## Acceptance criteria
- End-to-end in dev: questionnaire submission → review → resolve SELF (create), FATHER (create), link MOTHER to an existing person → confirm SELF—FATHER and SELF—MOTHER edges → complete submission → people and confirmed edges visible in the people browser; completing with an unresolved person is blocked by the API (409) and the UI explains it.

## Verification
- API unit tests for the local-key → edge mapping matrix (incl. grandparents and sibling-as-hint); integration tests for complete-guard and defer/ignore; web tests for the resolution card actions and the confirm flow (mocked).
- Standard API + web verification; manual dev run of the full loop.
- Commit as `task-27: admin review workspace`.
