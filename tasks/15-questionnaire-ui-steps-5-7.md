# Task 15: Questionnaire UI — steps 5–7, summary, consent, Turnstile

**Depends on:** 14 · **Size:** L · **Spec:** idea.md §9 (steps 5–7), §6 (Turnstile flow)

## Goal
Complete the questionnaire: repeatable relatives, origin questions, review summary with granular consents, Turnstile, and the submit/success/error experience. (The BFF/API wiring is Task 16 — here the client calls `POST /api/questionnaire/submit` and handles its responses.)

## Requirements
1. Step 5 — Други роднини: repeatable sections via `useFieldArray` for братя и сестри / деца / партньори / чичовци и лели / други роднини (add/remove cards, cap 10 each with a Bulgarian notice), plus the single „човек, който може да даде повече информация" block (idea.md §9).
2. Step 6 — Произход: all §9 fields (oldest known settlement, surname origin, spelling variants, family nicknames, migrations, relatives abroad, family stories, oldest living relative) **plus the family-materials question from Task 13** („Пазите ли стари снимки, документи или писма, свързани с рода?" + „Какви?" free text) with a Bulgarian hint that the family would love to see them at a later stage.
3. Step 7 — Преглед и съгласие:
   - Read-only Bulgarian summary of everything entered, grouped by step, with „Редактирай" links jumping to the step; skipped/empty sections appear as gentle Bulgarian nudges with a jump link — e.g. „Не сте описали баби и дядовци — дори само имената помагат." — never as blockers;
   - Five **separate** consent checkboxes per idea.md §9 with explicit texts and `CONSENT_VERSION`; only „обработване на данните" is required to submit;
   - Cloudflare Turnstile widget (`@marsidev/react-turnstile`, site key from `NEXT_PUBLIC_TURNSTILE_SITE_KEY`); submit disabled until required consent + Turnstile token exist; Turnstile error/expiry states re-render the widget with a Bulgarian message (idea.md §23 frontend tests);
   - Invitation token: if the page was opened as `/questionnaire?invite=...`, keep the token in state and include it in the submit payload.
4. Submission: POST to `/api/questionnaire/submit` with `{payload: toSubmissionPayload(...), turnstileToken, inviteToken?, idempotencyKey}` where the idempotency key is generated once per attempt-series (sessionStorage) so retries are safe; pending state disables the button.
5. Result handling: success → clear draft, redirect to `/questionnaire/success` showing a short reference code (first 8 chars of submission id), Bulgarian thank-you text, and a **snowball prompt**: „Изпратете въпросника на роднина, който знае повече" with a share button (Web Share API on mobile, copy-link fallback to the public `/questionnaire` URL); 429 → friendly Bulgarian „опитайте по-късно" message; validation errors → mapped to the summary; unknown errors → generic Bulgarian message, data kept.
6. Until Task 16 exists the route may 404 — tests mock `fetch`; note this in PROGRESS.
7. **Skippable steps (continues the Task 14 rule):** steps 5 and 6 also offer „Пропусни тази стъпка" and validate when empty; only the required consent gates the final submit.
8. **Mobile-first (mandatory, as in Task 14):** repeatable relative cards, the summary, consents, and the Turnstile widget must all work single-column at 360px width with no horizontal scroll; the submit flow is comfortable one-handed.

## Acceptance criteria
- Full 7-step flow works with client-side validation; consents gate submission; Turnstile token is required; summary faithfully reflects entered data; a minimal submission (steps 1, 2 + consent, everything else skipped) succeeds and the summary shows nudges for the skipped sections; all steps usable at 360px.

## Verification
- Component tests: field-array add/remove + caps; consent gating; summary rendering fixture incl. skipped-section nudges; minimal-path submit; submit payload shape (mocked fetch), 429 and Turnstile-error states; success page share prompt.
- Standard web verification; manual dev walk-through of all 7 steps, including a 360px viewport pass and a minimal (skip-everything) run.
- Commit as `task-15: questionnaire ui steps 5-7`.
