# Task 14: Questionnaire UI — steps 1–4 + multi-step shell

**Depends on:** 13 · **Size:** L · **Spec:** idea.md §9 (steps 1–4), §6 (UX-side abuse rules)

## Goal
The public questionnaire at `/questionnaire`: multi-step shell with progress, autosaved drafts, and fully working steps 1–4 in Bulgarian.

## Requirements
1. Multi-step shell (`/questionnaire` route, client component tree):
   - Stepper with Bulgarian step titles from idea.md §9 („За участника", „Информация за Вас", „Родители", „Баби и дядовци", „Други роднини", „Произход", „Преглед и съгласие"); current step indicator + progress.
   - One React Hook Form per step with `zodResolver` against Task 13 schemas; a shared store (React context or Zustand — pick one, note it) accumulates validated step data; "Напред" validates the current step before advancing; "Назад" preserves data.
   - Debounced autosave to the Task 13 draft module + „Записана чернова" indicator with timestamp; restore prompt on revisit („Продължи от черновата" / „Започни отначало").
   - Honeypot input (`website`) rendered visually hidden (`aria-hidden`, off-screen, `tabIndex=-1`); `formStartedAt` set once on mount.
2. Step 1 — За участника: fields per idea.md §9 incl. required consent checkbox for processing.
3. Step 2 — Информация за Вас: names, birth surname, previous surnames, nickname, year OR approximate year (checkbox „приблизително"), birthplace, places lived, living status radio (жив/починал/неизвестно). **No exact birth date input for living people.**
4. Step 3 — Родители: father + mother cards, each collapsible/optional, fields per §9 incl. relationship type select and information source.
5. Step 4 — Баби и дядовци: four labelled blocks (по бащина/майчина линия), fields per §9 (names, birth surname, nickname, years, places, occupation, family stories, source).
6. Accessibility: proper labels, `fieldset`/`legend` per person block, Bulgarian inline error messages, keyboard navigable, error summary focus on failed advance.
7. All copy in Bulgarian, sourced from `labels.ts` where shared with schemas.
8. **Mobile-first (mandatory):** the questionnaire will mostly be opened on phones from links shared in chat apps (Viber/Messenger). Build mobile-first: single-column layout, input font ≥16px (prevents iOS auto-zoom), large touch targets, sticky bottom bar with „Назад"/„Напред", stepper collapsing to a compact „Стъпка 2 от 7" indicator on small screens, no horizontal scroll at 360px width. Desktop is the enhancement, not the baseline.
9. **Skippable steps:** only steps 1 and 2 contain required fields. Steps 3 and 4 render an explicit „Пропусни тази стъпка" action that advances even when the section is completely empty (backed by the Task 13 minimal-path rule); partially filled person blocks still validate what was entered.

## Acceptance criteria
- A user can fill steps 1–4 with validation feedback, navigate back/forward without data loss, reload the page and restore the draft; steps 3–4 can be skipped entirely; every step is fully usable at 360px viewport width.

## Verification
- Component tests: each step renders and shows Bulgarian validation errors; advance blocked on invalid step; „Пропусни тази стъпка" advances with an empty section; draft restore round-trip; honeypot present but hidden.
- Standard web verification; manual `npm run dev` walk-through of steps 1–4, including a pass at 360px viewport width.
- Commit as `task-14: questionnaire ui steps 1-4`.
