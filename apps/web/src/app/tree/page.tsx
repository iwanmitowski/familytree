import { Suspense } from 'react';
import type { Metadata } from 'next';
import { TreeExplorer } from '@/features/tree/TreeExplorer';

export const metadata: Metadata = { title: 'Родословно дърво' };

export default function TreePage() {
  return (
    <div className="px-4 py-6">
      <h1 className="mb-1 text-2xl font-semibold tracking-tight">Родословно дърво</h1>
      <p className="mb-4 text-sm text-muted-foreground">
        Данните за живите хора остават скрити в публичния изглед.
      </p>
      <Suspense fallback={<p className="text-sm text-muted-foreground">Зареждане…</p>}>
        <TreeExplorer view="public" />
      </Suspense>
    </div>
  );
}
