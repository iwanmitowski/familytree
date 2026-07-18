# Task 26: Admin people browser, editing, merge UI

**Depends on:** 25 · **Size:** L · **Spec:** idea.md §16–§17 (admin routes), §8 (privacy levels), §10 (admin always chooses)

## Goal
The admin's canonical-data workbench: search people, inspect and edit a person, manage names/events/relationships/unions/sources from one place, and perform merges with a comparison dialog.

## Requirements — BFF
1. Admin route handlers (session + signed actor): `GET /api/admin/people` (search/filters), `GET /api/admin/people/[id]`, `PATCH /api/admin/people/[id]`, `POST /api/admin/people/[id]/merge`, `POST /api/admin/relationships` (+ PATCH/DELETE pass-throughs), union routes, source/evidence routes — thin proxies over Tasks 21–25 endpoints with error normalization.

## Requirements — Admin UI (Bulgarian)
2. `/admin/people`: search box (име, работи с кирилица и латиница — the API's variant search does the work), filters (жив/починал, privacy level), result table (име, години, статус badges: жив/private/merged), „Нов човек" dialog (manual create, Task 21 endpoint).
3. `/admin/people/[id]`: header card — preferred name, години, privacy select (частно/семейно/публично) and living-status select with immediate PATCH + toast; merged people show „Слят с..." banner linking to the target. Tabs:
   - **Имена** — list with type/preferred badges;
   - **Събития** — events with honest date rendering („ок. 1932", „1930–1935", „неизвестна") and place names;
   - **Връзки** — родители / деца (relationship type + verification badge: предложена/потвърдена/оспорена; actions: потвърди / оспори / изтрий → Task 22 endpoints) and add-forms with a person-picker (search) + „Добави родител / Добави дете";
   - **Съюзи** — unions with partners, „Нов съюз" + add/remove partner (Task 23);
   - **Източници** — evidence grouped by assertion with stance icons (подкрепя/оспорва) (Task 24);
   - **История** — merge history entries.
4. Merge dialog from the person page: „Слей с друг човек" → target search → side-by-side comparison (names, години, събития, брой връзки) → required „Причина" field → explicit confirmation checkbox → calls merge → redirect to target with success toast. Destructive styling, no one-click path.
5. Person-picker component (search + recent) reused by the review workspace (Task 27) — build it here, export from `src/features/people/`.

## Acceptance criteria
- Full circle in dev: create person → add parent (proposed) → confirm it → see verification badge change → merge a duplicate via dialog → land on target with merged data; cycle rejection (422) surfaces as a Bulgarian error toast, not a crash.

## Verification
- Web tests: search list, person page tabs from a fixture aggregate, relationship confirm action wiring, merge dialog gating (reason + checkbox required), 422 error surfacing.
- Standard web verification; manual dev walk-through against the real API.
- Commit as `task-26: admin people browser`.
