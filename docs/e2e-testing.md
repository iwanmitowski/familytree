# End-to-end tests (Playwright)

Proves the whole MVP loop against a real local stack (idea.md §23):
questionnaire → pending → admin review → create/link → confirm relationship →
tree shows the branch → public view masks the living.

## Prerequisites

- Docker (for the API + Postgres) and Node 22.
- Nothing else — the E2E stack is isolated (its own DB, secrets, and ports).

## Run it

```sh
npm ci

# 1. Backend: build the API, apply migrations, start Postgres + API on :8787.
bash scripts/e2e-up.sh

# 2. Web env: copy the example (official Turnstile test keys, test admin).
cp apps/web/.env.e2e.example apps/web/.env.e2e

# 3. Browsers + tests (Playwright starts `next dev` on :3000 for you).
cd apps/web
npx playwright install --with-deps chromium
npm run e2e            # or: npx playwright test
npm run e2e:report     # open the HTML report
```

Between specs the database is reset with `bash scripts/e2e-reset-db.sh` (truncates
staging + canonical tables; migrations are preserved).

Tear down: `docker compose -f docker-compose.e2e.yml down -v`.

## What is covered (idea.md §23 steps 1-8)

- `questionnaire.spec.ts` — fill the Bulgarian form, pass the Turnstile test
  widget, submit, assert the submission is `pending` (§23.1-2).
- `admin-review.spec.ts` — log in as the test admin, start review, create SELF +
  FATHER, link MOTHER to a pre-seeded person, confirm the parent edges, mark
  processed (§23.3-6).
- `tree.spec.ts` — the admin tree rooted at SELF shows the parents branch (§23.7).
- `public-privacy.spec.ts` — the public tree masks living members and public
  search cannot find a living person (§23.8).
- `invite.spec.ts` — a single-use invite is consumed then rejected.

## Test admin login

E2E logs in through an Auth.js **Credentials** provider that exists ONLY when
`E2E_TEST_MODE=1`. It is hard-guarded to throw if `VERCEL_ENV`/`APP_ENV` is
`production` (see [security.md](security.md)). Never set `E2E_TEST_MODE` in a
real deployment.

## Windows notes

- Run the shell scripts from Git Bash (`bash scripts/e2e-up.sh`).
- Docker Desktop must be running; the compose file binds only to `127.0.0.1`.
- Playwright and `next dev` run natively on Windows; only the API + Postgres are
  containerised.

## CI

The `.github/workflows/e2e.yml` workflow runs nightly and on manual dispatch
(not PR-blocking). Traces are uploaded as artifacts on failure.
