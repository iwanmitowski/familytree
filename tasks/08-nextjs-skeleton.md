# Task 08: Next.js app skeleton

**Depends on:** 01 · **Size:** M · **Spec:** idea.md §2 (Frontend/BFF stack), §17, §18

## Goal
A building, linted, tested Next.js App Router application in `apps/web` with Tailwind, shadcn/ui, Bulgarian locale, and the folder structure later tasks rely on.

## Requirements
1. Initialize Next.js (latest stable, App Router, TypeScript strict, `src/` dir, ESLint) in `apps/web`; npm with committed lockfile; Node 22 (`engines` + `.nvmrc`).
2. Tailwind CSS + shadcn/ui initialized (neutral theme); install the base primitives used later: button, input, label, select, checkbox, radio-group, textarea, card, dialog, table, badge, tabs, toast/sonner, form.
3. Structure per idea.md §18: `src/app/`, `src/components/` (incl. `ui/`), `src/features/`, `src/lib/`, `src/server/`. Add placeholder module files so the dirs are real.
4. Root layout: `lang="bg"`, Bulgarian metadata (title: „Родословно дърво Митовски“), font with full Cyrillic support (self-hosted via `next/font`), header/footer shell with nav placeholders: „Начало", „Въпросник", „Родословно дърво".
5. Home page: short Bulgarian intro of the project (family history, questionnaire invitation) + CTA links to `/questionnaire` and `/tree` (pages can be placeholders).
6. Bulgarian `error.tsx` and `not-found.tsx`.
7. TanStack Query provider wired in a client component wrapper (used by later tasks).
8. Testing: Vitest + @testing-library/react + jsdom configured; `npm test` runs; add a smoke test (home page renders the Bulgarian title). Scripts: `dev`, `build`, `lint`, `typecheck` (`tsc --noEmit`), `test`.
9. `apps/web/.env.example` listing (empty values): `ORACLE_API_BASE_URL`, `SERVICE_ID`, `SERVICE_HMAC_SECRET`, `IP_HASH_SECRET`, `NEXT_PUBLIC_TURNSTILE_SITE_KEY`, `TURNSTILE_SECRET_KEY`, `AUTH_SECRET`, `ADMIN_EMAIL_ALLOWLIST`, `OAUTH_CLIENT_ID`, `OAUTH_CLIENT_SECRET` (idea.md §20). Only the Turnstile site key is `NEXT_PUBLIC_`.
10. Update root README quickstart for the web app.

## Acceptance criteria
- `npm run build` succeeds; home page shows Bulgarian content; no secret env var is `NEXT_PUBLIC_`.

## Verification
- Standard web verification (`lint`, `typecheck`, `test -- --run`, `build`).
- Commit as `task-08: nextjs skeleton`.
