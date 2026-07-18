# Task 35: Deployment workflows

**Depends on:** 10, 11 · **Size:** M · **Spec:** idea.md §20 (entire section — the 9-step API deploy is normative), §18 (workflows)

## Goal
Automated, safe deployment: ARM64 image build + push, SSH deploy to the Oracle VM with migrations and healthcheck gate, SHA tagging with rollback, and the finalized Bulgarian deployment runbook. Web deploys via Vercel's git integration.

## Requirements
1. `.github/workflows/deploy-api.yml` — trigger: push to `main` touching `services/api/**` or `infra/oracle/**`, plus `workflow_dispatch` with input `image_tag` (for rollback re-deploys). Jobs implementing idea.md §20 steps 1–9:
   1. **test**: run the api test suite (reuse CI steps);
   2. **build-push**: docker buildx `--platform linux/arm64` → push to GHCR as `ghcr.io/<owner>/familytree-api:<commit-sha>` and `:main` (**never `latest` as the only tag** — idea.md §20);
   3. **deploy** (environment `production`): SSH to the VM (host/user/key from GitHub secrets) and run a remote script that: writes the target tag to `/opt/familytree/.deploy-tag`, `docker compose pull api`, **runs migrations first** via the one-shot service (`docker compose --profile ops run --rm migrate`), `docker compose up -d api caddy`, then healthcheck gate: curl `https://$API_DOMAIN/health` with retries (10×3s); non-200 → exit 1, workflow fails, and the log prints the previous tag + exact rollback command (idea.md §20.9);
   - Keep the remote logic in a committed script `scripts/deploy.sh` (idea.md §18) executed over SSH, not inline YAML.
2. Rollback: `workflow_dispatch` with `image_tag=<previous-sha>` redeploys that image (migrations are forward-only; document that a bad migration needs a restore per Task 33 docs).
3. `.github/workflows/deploy-web.yml`: decision — Vercel's native GitHub integration does web deploys (simplest secure option); this workflow only runs web checks on `main` as a deploy gate and documents the setup. Vercel project env vars checklist (idea.md §20 web list) goes into the docs.
4. Docs — finalize `docs/deployment-oracle-bg.md` (**Bulgarian**): GitHub secrets list (`DEPLOY_SSH_HOST/USER/KEY`, optional `GHCR_TOKEN` if needed), first-deploy runbook, normal deploy flow, rollback стъпка по стъпка, Vercel setup (домейн, env vars, git integration).
5. `actionlint` clean; no secrets in the repo; deploy workflow does nothing without the configured secrets (graceful skip with a clear message on forks).

## Acceptance criteria
- Workflow YAML valid and consistent with the actual compose/profile/service names from Task 10; `scripts/deploy.sh` is idempotent and shellcheck-clean; rollback path documented and dispatchable.

## Verification
- `npx actionlint`; `shellcheck scripts/deploy.sh`; dry-run the remote script logic locally against dev compose (with a fake tag variable) to prove command correctness.
- Commit as `task-35: deployment workflows`.
