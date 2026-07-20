'use client';

import type { TreeNode, TreeProjection } from './types';
import { parentsOf, childrenOf } from './graph-ops';
import { personYears } from './labels';

/**
 * Mobile fallback (<768px): a navigable pedigree list instead of the canvas
 * (idea.md §14). Tap a relative to re-root; no horizontal scroll.
 */
export function MobilePedigree({ projection, onReRoot }: { projection: TreeProjection; onReRoot: (id: string) => void }) {
  const byId = new Map(projection.nodes.map((n) => [n.id, n]));
  const root = byId.get(projection.rootPersonId);
  if (!root) return <p className="p-4 text-sm text-muted-foreground">Няма данни за показване.</p>;

  const parents = parentsOf(projection, root.id).map((id) => byId.get(id)).filter(Boolean) as TreeNode[];
  const children = childrenOf(projection, root.id).map((id) => byId.get(id)).filter(Boolean) as TreeNode[];

  return (
    <div className="space-y-4 overflow-x-hidden p-3">
      <p className="rounded-md border bg-muted/40 p-2 text-xs text-muted-foreground">
        Пълното интерактивно дърво е налично на по-голям екран.
      </p>

      <div className="rounded-lg border p-3">
        <p className="text-xs uppercase text-muted-foreground">Избран</p>
        <p className="text-base font-semibold">{root.label || 'Без име'}</p>
        <p className="text-sm text-muted-foreground">{personYears(root)}</p>
      </div>

      <Group title="Родители" people={parents} onReRoot={onReRoot} empty="Няма заредени родители." />
      <Group title="Деца" people={children} onReRoot={onReRoot} empty="Няма заредени деца." />
    </div>
  );
}

function Group({
  title, people, onReRoot, empty,
}: {
  title: string;
  people: TreeNode[];
  onReRoot: (id: string) => void;
  empty: string;
}) {
  return (
    <div>
      <p className="mb-1 text-sm font-medium">{title}</p>
      {people.length === 0 ? (
        <p className="text-sm text-muted-foreground">{empty}</p>
      ) : (
        <ul className="space-y-1">
          {people.map((p) => (
            <li key={p.id}>
              <button
                type="button"
                onClick={() => onReRoot(p.id)}
                className="flex w-full items-center justify-between rounded-md border px-3 py-2 text-left text-sm hover:bg-muted"
              >
                <span className="font-medium">{p.label || 'Без име'}</span>
                <span className="text-muted-foreground">{personYears(p)}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
