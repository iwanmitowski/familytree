'use client';

import Link from 'next/link';
import type { TreeNode } from './types';
import { personYears, unionTypeLabel } from './labels';
import { Button } from '@/components/ui/button';

export function SidePanel({
  node, view, onClose, onStartPath, onReRoot,
}: {
  node: TreeNode;
  view: 'public' | 'admin';
  onClose: () => void;
  onStartPath: (id: string) => void;
  onReRoot: (id: string) => void;
}) {
  if (node.type === 'union') {
    return (
      <Card onClose={onClose}>
        <p className="text-sm font-medium">{unionTypeLabel(node.unionType)}</p>
      </Card>
    );
  }
  const years = personYears(node);
  return (
    <Card onClose={onClose}>
      <p className="text-base font-semibold">{node.label || 'Без име'}</p>
      {years && <p className="text-sm text-muted-foreground">{years}</p>}
      {node.sourceCount != null && node.sourceCount > 0 && (
        <p className="text-xs text-muted-foreground">Източници: {node.sourceCount}</p>
      )}
      <div className="mt-3 flex flex-col gap-2">
        <Button size="sm" variant="outline" onClick={() => onReRoot(node.id)}>Направи корен</Button>
        <Button size="sm" variant="outline" onClick={() => onStartPath(node.id)}>Виж връзката с…</Button>
        {view === 'admin' && (
          <Button size="sm" variant="ghost" asChild>
            <Link href={`/admin/people/${node.id}`}>Отвори в администрацията →</Link>
          </Button>
        )}
      </div>
    </Card>
  );
}

function Card({ children, onClose }: { children: React.ReactNode; onClose: () => void }) {
  return (
    <div className="absolute right-3 top-3 z-20 w-64 rounded-lg border bg-card p-4 shadow-lg">
      <button onClick={onClose} className="absolute right-2 top-2 text-muted-foreground hover:text-foreground" aria-label="Затвори">
        ×
      </button>
      {children}
    </div>
  );
}
