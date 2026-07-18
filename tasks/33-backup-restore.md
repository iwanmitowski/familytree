# Task 33: Encrypted backups, retention, restore & verify

**Depends on:** 10 · **Size:** L · **Spec:** idea.md §21 (entire section — normative), §18 (scripts/, docs)

## Goal
The full backup story: daily encrypted `pg_dump` to OCI Object Storage with retention, a weekly second copy, restore tooling, an automated monthly restore test, and a Bulgarian runbook. Everything testable locally against the dev compose stack.

## Requirements
1. `scripts/backup-db.sh` (bash, `set -euo pipefail`, shellcheck-clean), designed to run on the VM via cron and locally for testing:
   - `flock` lock file — a second concurrent run exits immediately (idea.md §21);
   - `pg_dump --format=custom` via `docker compose exec -T postgres` using env credentials (`PGPASSWORD` from env file **never echoed**; no `set -x`);
   - Write to a temporary filename; on success: `sha256sum` sidecar → `age -r $AGE_RECIPIENT` encryption → upload dump+checksum via `rclone copyto` to the primary remote (OCI Object Storage S3-compat) under `db/daily/YYYY-MM-DD/`; only after successful upload delete temp files; every step's exit code checked (traps clean temps on failure);
   - Naming prefixes drive retention: `daily/`, plus promote Sunday's dump to `weekly/` and the 1st of the month to `monthly/`;
   - Retention pruning per idea.md §21: keep 14 daily, 8 weekly, 12 monthly (rclone listing + sorted deletion);
   - Also export and upload (idea.md §21 list): GEDCOM/JSON/CSV artifacts **if the Task 34 export subcommand exists** — wire behind a feature check so task order doesn't break; plus a `manifest.json` (files, sizes, checksums);
   - Final status: write `backup-status.json` (timestamp, result, sizes) to a known path and, when `NOTIFY_WEBHOOK_URL` is set, POST a failure/success ping (failures must never be silent — idea.md §21).
2. Secondary copy: `--remote r2` flag switching the rclone remote; weekly cron entry uses it (idea.md §21 „второ независимо копие").
3. `scripts/restore-db.sh`: args `<backup-path> <target-db>`; download → checksum verify → `age -d` (identity file path from env) → `pg_restore --clean --if-exists` into the target; interactive „yes" confirmation unless `--force` (it drops data); never touches the prod DB name unless explicitly passed.
4. `scripts/verify-backup.sh` — the idea.md §21 monthly automated test: create temp DB `familytree_restore_test` → restore latest daily → `api migrate status` clean → row-count sanity (people, submissions ≥ configurable minimums) → integrity queries (orphan FK probe, self-parent probe, merged-people-as-parents probe) → drop temp DB → write/POST status. Cron entry monthly.
5. Cron installation: `infra/oracle/cron.d/familytree` (daily backup 03:30, weekly R2 04:00 Sunday, monthly verify) + docs on installing it; age key generation and **offline private-key custody** documented (private key NOT on the VM; restore happens with the operator's key).
6. `docs/backup-and-restore-bg.md` (**Bulgarian**, idea.md §18): пълна процедура — какво се архивира, къде, ключове, ротация, как се възстановява стъпка по стъпка, как се тества месечно, какво се прави при повреден бекъп.
7. `infra/oracle/env.example` additions: `AGE_RECIPIENT`, rclone remote names, `NOTIFY_WEBHOOK_URL`, retention overrides.

## Acceptance criteria
- Local end-to-end: dev DB → backup script (rclone to a local-dir remote) → restore into a fresh DB → verify script passes; lock prevents a parallel run; a grep of script output shows no password; failure path (kill upload) leaves temps cleaned and status=failed.

## Verification
- Run the local end-to-end via Git Bash/WSL against dev compose; `shellcheck scripts/*.sh` clean; document the run in PROGRESS notes.
- Commit as `task-33: backup and restore`.
