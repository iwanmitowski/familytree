# Task 34: GEDCOM / JSON / CSV exports

**Depends on:** 23 · **Size:** M · **Spec:** idea.md §1.12, §21 (export artifacts), §18 (`scripts/export-gedcom.sh`)

## Goal
Deterministic data exports as Go subcommands: GEDCOM for genealogy software, JSON for machine re-import, CSVs for spreadsheets — full (admin/backup) and privacy-redacted (`--public`) variants.

## Requirements
1. Go subcommands (reuse repositories; no HTTP): `api export gedcom|json|csv-people|csv-relationships --out <path> [--public]`.
2. **GEDCOM 5.5.1**, UTF-8:
   - `HEAD` (CHAR UTF-8, SOUR placeholder), one `INDI` per non-merged non-deleted person (stable ordering by id for deterministic output): `NAME` with surname slashes from the preferred primary name, other names as additional `NAME`/`NICK`; `BIRT`/`DEAT` with honest dates — `date_precision` mapping: exact → `DD MON YYYY`, month → `MON YYYY`, year → `YYYY`, approximate → `ABT YYYY`, range → `BET YYYY AND YYYY`, unknown → omitted (never a fake date — conventions §3); `RESI` with place text;
   - `FAM` records from family_unions (HUSB/WIFE/CHIL via union partners + child edges with that union) and synthetic FAMs for unionless confirmed parent pairs; `FAMC`/`FAMS` links; adoptive edges: `CHIL` + `PEDI adopted`;
   - Sources: one `SOUR` record per source, referenced from supported facts where evidence exists (minimal but valid);
   - `--public`: run every person through the `PersonRedactionService` (Task 30) — living people exported as anonymized stubs (no name → `NAME Жив член /Митовски/`? No: use `NAME Unknown //` + no facts; document) or skipped entirely (**decision: skip living people in public GEDCOM, keep structure via deceased-only lines**; document in code + docs).
3. **JSON**: versioned envelope `{exportVersion: 1, generatedAt, people: [...], names, events, places, parentChildRelationships, unions, unionPartners, sources}` — flat arrays mirroring the relational model (idea.md §26: not a nested tree); `--public` applies redaction.
4. **CSV**: `people.csv` (id, preferred name, birth/death years, living, privacy) and `relationships.csv` (parent_id, child_id, type, verification, union_id); UTF-8 **with BOM** so Excel opens Cyrillic correctly (document).
5. `scripts/export-gedcom.sh`: wrapper running the subcommand inside the api container to a mounted output dir (used by backup Task 33 — flip its feature check on and verify wiring).
6. Golden-file tests: fixture family → committed expected GEDCOM/JSON/CSV outputs (stable ordering makes this possible); a minimal GEDCOM structural validator test (line format `LEVEL [XREF] TAG [VALUE]`, xref integrity of FAMC/FAMS/HUSB/WIFE/CHIL).

## Acceptance criteria
- Deterministic byte-identical re-runs on an unchanged DB; public variant contains zero living-person data (deep-scan test reusing Task 30's forbidden list); GEDCOM imports without structural errors into a validator-parser test.

## Verification
- Standard Go verification + integration (fixture DB → run all exports → golden compare).
- Update backup script wiring; run a local backup to confirm artifacts appear in the manifest.
- Commit as `task-34: gedcom json csv exports`.
