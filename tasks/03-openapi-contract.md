# Task 03: OpenAPI 3.1 contract

**Depends on:** 02 · **Size:** M · **Spec:** idea.md §4 (headers), §11, §13, §16 (endpoints)

## Goal
Create `contracts/openapi.yaml` — the contract-first specification of the Oracle API (TypeScript/Node). Later tasks keep it in sync as they implement endpoints.

## Requirements
1. OpenAPI **3.1**, info block naming the service, placeholder server `https://api.rod.mitovski.example`.
2. Document every endpoint from idea.md §16, grouped with tags: `submissions`, `matching`, `people`, `relationships`, `tree`, `ops`. Include the invites endpoints (`POST/GET /v1/internal/invites`, `POST /v1/internal/invites/{id}/revoke`) which Stage 2 needs.
3. Security: define the HMAC scheme as a documented multi-header mechanism (idea.md §4): `X-Service-Id`, `X-Request-Timestamp`, `X-Request-Nonce`, `X-Idempotency-Key`, `X-Body-SHA256`, `X-Actor-Id`, `X-Actor-Role`, `X-Signature`. Model them as reusable header parameters + a top-level description of the canonical signing payload; mark `GET /health` as the only unauthenticated endpoint.
4. `components/schemas` at minimum: `Error` (uniform shape from conventions §5), `Submission`, `SubmissionPerson`, `SubmissionRelationship`, `Invite`, `Consent`, `MatchCandidate` (score + reasons array per idea.md §10 example), `Person`, `PersonName`, `PersonEvent`, `ParentChildRelationship`, `FamilyUnion`, `TreeProjection` (nodes/edges exactly per idea.md §13 example, incl. `union` node type, `generation`, `truncated`), `RelationshipPathResult` (per idea.md §11 example).
5. Enums match `docs/data-model.md` (statuses, relationship types, date precision, privacy levels).
6. POST endpoints note idempotency semantics (same key + same body ⇒ replayed response; same key + different body ⇒ 409).
7. Standard error responses (400/401/403/404/409/422/429) referenced via components.

## Acceptance criteria
- Spec lints clean; every §16 endpoint present; examples for tree projection and relationship path match idea.md.

## Verification
- `npx @redocly/cli lint contracts/openapi.yaml` passes (warnings acceptable, errors not).
- Commit as `task-03: openapi contract`.
