'use client';

import { useQuery } from '@tanstack/react-query';
import { adminApi } from '@/features/admin/client';
import type { PersonEvidenceItem } from './types';
import { SOURCE_TYPE_LABELS, STANCE_LABELS, label as toLabel } from './labels';
import { Badge } from '@/components/ui/badge';

export function SourcesTab({ personId, sourceCount }: { personId: string; sourceCount: number }) {
  const { data, isLoading, error } = useQuery({
    queryKey: ['admin', 'person', personId, 'evidence'],
    queryFn: () => adminApi.get<{ items: PersonEvidenceItem[] }>(`/api/admin/people/${personId}/evidence`),
  });

  if (isLoading) return <p className="text-sm text-muted-foreground">Зареждане…</p>;
  if (error) return <p className="text-sm text-destructive">Грешка при зареждане.</p>;

  const items = data?.items ?? [];
  const byAssertion = new Map<string, PersonEvidenceItem[]>();
  for (const it of items) {
    const list = byAssertion.get(it.assertion) ?? [];
    list.push(it);
    byAssertion.set(it.assertion, list);
  }

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">Различни източници: {sourceCount}</p>
      {items.length === 0 ? (
        <p className="text-sm text-muted-foreground">Няма прикачени доказателства.</p>
      ) : (
        [...byAssertion.entries()].map(([assertion, group]) => (
          <section key={assertion}>
            <h3 className="mb-1 text-sm font-medium">{assertion}</h3>
            <ul className="space-y-1">
              {group.map((e) => (
                <li key={e.id} className="flex items-center justify-between gap-2 rounded-md border p-2 text-sm">
                  <span className="flex items-center gap-2">
                    <span
                      className={e.stance === 'supports' ? 'text-green-600' : 'text-destructive'}
                      aria-label={toLabel(STANCE_LABELS, e.stance)}
                      title={toLabel(STANCE_LABELS, e.stance)}
                    >
                      {e.stance === 'supports' ? '✓' : '✗'}
                    </span>
                    <span className="font-medium">{e.sourceTitle}</span>
                  </span>
                  <Badge variant="outline">{toLabel(SOURCE_TYPE_LABELS, e.sourceType)}</Badge>
                </li>
              ))}
            </ul>
          </section>
        ))
      )}
    </div>
  );
}
