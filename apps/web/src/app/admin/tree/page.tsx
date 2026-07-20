'use client';

import { Suspense } from 'react';
import { TreeExplorer } from '@/features/tree/TreeExplorer';

export default function AdminTreePage() {
  return (
    <div>
      <h1 className="mb-4 text-2xl font-semibold tracking-tight">Дърво</h1>
      <Suspense fallback={<p className="text-sm text-muted-foreground">Зареждане…</p>}>
        <TreeExplorer view="admin" />
      </Suspense>
    </div>
  );
}
