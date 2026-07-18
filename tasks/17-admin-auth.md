# Task 17: Admin authentication

**Depends on:** 08 · **Size:** M · **Spec:** idea.md §5 (Администратор)

## Goal
Auth.js-based admin login in the Next.js app with an email allowlist, short sessions, and a protected `/admin` shell. The Oracle API never sees OAuth — it keeps trusting only signed actor headers (idea.md §5).

## Requirements
1. Auth.js (current stable for Next App Router) with **Google** provider (decision: one provider is enough; GitHub can be added later — note as ADR-worthy only if changed). Config in `src/server/auth.ts`.
2. `ADMIN_EMAIL_ALLOWLIST` env (comma-separated, case-insensitive): `signIn` callback rejects any email not on the list; rejected users see a Bulgarian „Нямате достъп" page. Allowlisted users get `role: 'admin'` in the JWT/session.
3. Sessions: JWT strategy, `maxAge` 8h, `updateAge` 1h; secure HttpOnly cookies, `SameSite=Lax` (Auth.js defaults verified, not assumed); `AUTH_SECRET` required (idea.md §5).
4. Route protection:
   - `middleware.ts`: everything under `/admin` (except `/admin/login`) redirects unauthenticated users to login; `/api/admin/*` returns 401 JSON;
   - Server helper `requireAdminSession()` used by every admin route handler — returns the session or throws a 401 response; admin BFF calls will pass `actorId = session.email`, `actorRole = 'admin'` into the signed request (Task 09 client).
   - CSRF hardening for admin mutations: BFF admin routes require header `X-Admin-Request: 1` (set by our fetch wrapper; blocked cross-origin by CORS) in addition to SameSite cookies. Document in `docs/security.md`.
5. UI: `/admin/login` Bulgarian page with Google button; `/admin` layout shell — sidebar nav („Заявки", „Покани", „Хора", „Дърво") with placeholders, current user + „Изход" button.
6. Env additions already listed in `.env.example` (Task 08) — fill in comments; never `NEXT_PUBLIC_`.

## Acceptance criteria
- Non-allowlisted Google account cannot obtain an admin session; allowlisted account reaches `/admin`; `/api/admin/ping` (add a trivial protected route for testing) returns 401 without a session and 200 with one.

## Verification
- Unit tests: allowlist matcher (case, spacing), `requireAdminSession` behavior (mocked), middleware matcher config.
- Standard web verification; manual dev login flow with a test Google OAuth app documented in PROGRESS notes.
- Commit as `task-17: admin authentication`.
