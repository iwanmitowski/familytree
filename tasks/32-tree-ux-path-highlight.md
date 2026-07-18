# Task 32: Tree UX — expand/collapse, view modes, path highlighting, mobile

**Depends on:** 31 · **Size:** M · **Spec:** idea.md §14 (interaction list), §11 (relationship path)

## Goal
Complete the idea.md §14 interaction set: branch expand/collapse, loading more generations, ancestor/descendant/combined views, relationship-path highlighting, side panel, and a mobile fallback.

## Requirements
1. **View modes**: „Предци" / „Потомци" / „Комбиниран" toggle → adjusts `ancestors`/`descendants` params (ancestor-only: descendants=0, etc.).
2. **Load more generations**: when `truncated` or at depth limit, boundary nodes show a „Покажи още" affordance → refetch with increased depth **anchored at that node** and merge the new projection into the current graph client-side (`mergeProjections()` util — dedupe by node/edge id); collapse branch hides a node's subtree client-side (chevron on nodes with hidden-able descendants), expand restores.
3. **Center on person** + smooth pan; double-click a node → make it the new root (`?root=` update).
4. **Side panel** on select: redacted person details (from the projection + optional detail fetch), „Виж връзката с..." action, and for admins „Отвори в администрацията" link.
5. **Relationship path** (idea.md §11/§14): „Връзка между двама души" mode — pick person A and B (side panel action or search), call `GET /api/relationship?personA=&personB=` → highlight the returned path's nodes/edges (distinct color + dimmed rest), show a Bulgarian result card: „Иван и Мария са втори братовчеди" + confidence + common ancestors (redacted per view); „Изчисти" resets. If a path endpoint person is outside the loaded graph, refetch a projection that includes the path.
6. **Mobile fallback** (<768px): the canvas is replaced by a navigable pedigree list (root card, „Родители", „Деца" link groups — tap to re-root) with a notice that the full tree is available on desktop; no horizontal page scroll.
7. Performance: memoized node components, layout recompute only on graph change, node-count warning banner beyond ~300 visible nodes.
8. Tests: `mergeProjections` (dedupe, edge cases), collapse/expand state logic, path-highlight state reducer, view-mode param mapping.

## Acceptance criteria
- Dev walk-through: load 3 generations → expand a grandparent branch → collapse it → switch to ancestors-only → highlight the path between two cousins with the Bulgarian label shown → open the same page on a narrow viewport and get the list fallback.

## Verification
- Standard web verification + the unit tests above; manual dev checks per the walk-through.
- Commit as `task-32: tree ux and path highlighting`.
