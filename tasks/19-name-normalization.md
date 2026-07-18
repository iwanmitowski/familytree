# Task 19: Name normalization & transliteration package

**Depends on:** 06 · **Size:** M · **Spec:** idea.md §10 (normalization pipeline), §23 (normalization tests)

## Goal
A deterministic TypeScript module for Bulgarian name normalization, controlled transliteration, surname-variant awareness, and search tokens — wired into the submission ingest path.

## Requirements
1. Module `src/names` in `@familytree/api` (pure functions, no DB; use Node's built-in Unicode support — `String.prototype.normalize`, `Intl` where needed):
   - `normalize(s: string): string`: Unicode NFC → lowercase (Unicode-aware) → trim → collapse internal whitespace → strip punctuation except hyphen → normalize `ѝ` → `и`. Idempotent. Original values are always stored alongside (idea.md §10).
   - `transliterate(s: string): string`: Cyrillic→Latin per the official Bulgarian transliteration law (2009 streamlined system: ж→zh, ч→ch, ш→sh, щ→sht, ъ→a, ь→y, ю→yu, я→ya, ц→ts …); table-driven, documented in code.
   - `surnameVariants(surname: string): string[]`: gender pairs (—ски↔—ска, —ов↔—ова, —ев↔—ева) + transliterations of each; input recognition also folds Latin `y→i` and `sky→ski` so `Mitovsky` matches the `mitovski` variant set. Variants are **matching aids only — never proof of identity** (idea.md §10: „Не ги приемай автоматично за един и същ човек").
   - `searchTokens(fullName: string): string[]`: normalized tokens + transliterated tokens, deduplicated, sorted.
2. Wire into write paths:
   - Submission ingest (Task 16 code): replace the placeholder with `normalize(first + middle + surname)` for `submission_people.normalized_name`;
   - Provide a `buildPersonNameRow` helper that Task 21 will use to fill `person_names.normalized_name` and `transliterated_name`.
3. Golden-file tests (Vitest, fixture corpus + table tests):
   - The idea.md §10 set: Митовски / Митовска / Mitovski / Mitovsky all land in one variant set;
   - Whitespace/punctuation/case chaos → clean normalized output; NFC vs NFD input equal after normalize;
   - Transliteration table spot checks (Живков→Zhivkov, Църков→Tsarkov, Щерев→Shterev, Юлия→Yulia);
   - Property: `normalize(normalize(x)) === normalize(x)` for the corpus.

## Acceptance criteria
- Deterministic, idempotent pipeline; ingest now persists proper normalized names; golden tests lock behavior.

## Verification
- Standard API verification + integration test that a new submission stores the normalized names.
- Commit as `task-19: name normalization and transliteration`.
