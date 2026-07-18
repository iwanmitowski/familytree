# Task 18: Admin submissions inbox + status workflow + invites UI

**Depends on:** 16, 17 · **Size:** L · **Spec:** idea.md §8 (submission statuses), §16 (submission endpoints), §17 (admin routes)

## Goal
Admins can see incoming submissions, inspect full detail, and move them through the status workflow; plus a management page for invitation tokens.

## Requirements — API
1. Status-transition endpoints (idea.md §16), each guarded by a state machine (invalid transition → 409 `invalid_transition`), admin role, audit entry:
   - `POST /v1/internal/submissions/{id}/start-review`: `pending → in_review`, sets `processing_started_at`;
   - `POST /v1/internal/submissions/{id}/reject` `{reason}`: `pending|in_review → rejected`, sets `rejected_at`;
   - `POST /v1/internal/submissions/{id}/mark-spam` `{reason}`: `pending|in_review → spam`, sets `spam_reason`.
2. **Snowball leads:** `GET /v1/internal/contact-leads` — aggregates potential next contacts from non-spam submission payloads: (a) participants who accepted the `contact` consent (name, contact details, submission id), (b) every „човек, който може да даде повече информация" block from step 5. Lead shape: `{name, contactHint, kind: 'participant'|'referral', sourceSubmissionId}`. Read-only JSONB aggregation query — no new tables.
3. **Materials flag:** extend the Task 16 submissions **list** response with `hasMaterials`, derived from the step-6 family-materials answer in the payload (Task 13 field).
4. Update `contracts/openapi.yaml`.

## Requirements — BFF
5. Admin route handlers (all via `requireAdminSession()` + signed with actor from session): `GET /api/admin/submissions` (pass filters/pagination), `GET /api/admin/submissions/[id]`, `POST /api/admin/submissions/[id]/start-review|reject|mark-spam`; invites: `GET/POST /api/admin/invites`, `POST /api/admin/invites/[id]/revoke`; leads: `GET /api/admin/contact-leads`.

## Requirements — Admin UI (Bulgarian)
6. `/admin/submissions`: table (дата, участник — name pulled from payload step 1, статус badge с цветове, кампания на поканата, брой описани хора, „Материали" badge when `hasMaterials`), status filter tabs (Чакащи / В преглед / Обработени / Отхвърлени / Спам), pagination.
7. `/admin/submissions/[id]`: readable rendering of the original payload grouped by questionnaire step (never raw JSON as the primary view; a collapsible „Суров JSON" section is fine), people table (local key, names, years, living status), relationships list, consents with versions, meta (submitted at, duration, fingerprint prefix, invite), and the family-materials answer shown prominently when present („Пази материали: да — стари писма и снимки"). Action buttons „Започни преглед" / „Отхвърли" (reason dialog) / „Маркирай като спам" (reason dialog) with confirmation dialogs and optimistic status refresh (TanStack Query).
8. `/admin/invites`: create form (получател, кампания, валидност, макс. брой), result dialog showing the plain token **once** with copy button + „Линк за въпросника" (`/questionnaire?invite=...`), list with usage/status, „Анулирай" action.
9. **„Потенциални контакти" panel** on `/admin/invites` (from `GET /api/admin/contact-leads`): lead list — име, контакт, вид badge („участник" / „препоръчан"), link to the source submission — each with a „Създай покана" button that opens the invite create form prefilled (recipient label = lead name, campaign = source submission's campaign or `snowball`). This closes the collection loop: every submission generates the next invitations.

## Acceptance criteria
- Full flow in dev: submit questionnaire → appears in Чакащи → Започни преглед → В преглед; invalid transitions blocked server-side; invite created in UI works end-to-end on the public form.
- A submission naming a referral in step 5 shows up in „Потенциални контакти" and „Създай покана" opens the prefilled form; a submission answering „да" on materials shows the „Материали" badge in the list and the answer in the detail view.

## Verification
- API integration tests: every legal + illegal transition; audit rows written; contact-leads aggregation (consented participant + referral extracted, non-consented and spam excluded); `hasMaterials` derivation.
- Web tests: list renders fixtures incl. „Материали" badge, detail renders payload sections, actions call the right routes (mocked), token-shown-once dialog, leads panel renders and prefills the invite form.
- Standard API + web verification; manual dev walk-through.
- Commit as `task-18: admin submissions inbox`.
