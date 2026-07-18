# Task 37: Playwright E2E suite

**Depends on:** 27, 31 · **Size:** L · **Spec:** idea.md §23 (E2E — the 8-step scenario is normative), §25 (DoD flows)

## Goal
End-to-end proof of the whole MVP loop against a real local stack: questionnaire → pending → admin review → create/link → confirm relationship → tree shows the branch → public view masks the living.

## Requirements
1. Test stack: `docker-compose.e2e.yml` (postgres + api image built from source with test env: distinct `SERVICE_HMAC_SECRET`, migrations applied on boot) + `apps/web` started with `.env.e2e` (`ORACLE_API_BASE_URL=http://127.0.0.1:<port>`, Turnstile **official test keys** — site `1x00000000000000000000AA`, secret `1x0000000000000000000000000000000AA` — always-pass).
2. Admin auth for tests: enable an Auth.js **Credentials** provider (test admin email/password from env) **only when `E2E_TEST_MODE=1`**; hard guard: the provider registration throws if `E2E_TEST_MODE` is set in a production build/environment; document the guard in `docs/security.md`. Test admin email added to the allowlist in `.env.e2e`.
3. Playwright config in `apps/web` (`e2e/` dir): webServer entries (or a `scripts/e2e-up.sh` orchestrator), trace-on-failure, a DB reset helper between specs (truncate staging+canonical tables via a maintenance SQL script executed with docker compose exec).
4. Specs (idea.md §23 E2E steps 1–8, split sensibly):
   - `questionnaire.spec.ts`: fill all 7 steps in Bulgarian (fixture data incl. parents + one grandparent), pass Turnstile test widget, submit, see the success page; assert via admin API that the submission is `pending` (§23.2);
   - `admin-review.spec.ts`: login as test admin → open the submission → Започни преглед → resolve SELF and FATHER with „Създай нов човек", MOTHER with „Свържи" against a pre-seeded person → confirm the two parent edges in „Връзки" → Маркирай като обработена;
   - `tree.spec.ts`: admin tree rooted at SELF shows the new branch (FATHER, MOTHER nodes and edges) (§23.7);
   - `public-privacy.spec.ts`: public `/tree` for the same root shows „Жив член на семейството" masks and no real names for living people (§23.8); public search cannot find the living SELF by name;
   - `invite.spec.ts`: admin creates an invite → open `/questionnaire?invite=...` → submit → invite `used_submissions` incremented; second use of a max-1 invite is rejected with the Bulgarian message.
5. CI: `e2e` job in a separate workflow (nightly schedule + `workflow_dispatch`), not PR-blocking; artifacts: traces on failure.
6. README/docs: how to run E2E locally (`scripts/e2e-up.sh` + `npx playwright test`), Windows notes.

## Acceptance criteria
- The full suite passes locally from a clean checkout with only Docker + Node installed; each idea.md §23 E2E step (1–8) is asserted somewhere in the suite.

## Verification
- `npx playwright test` green locally (attach summary to PROGRESS notes); nightly workflow YAML actionlint-clean.
- Commit as `task-37: e2e playwright suite`.
