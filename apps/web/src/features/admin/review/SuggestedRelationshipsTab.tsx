'use client';

import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { adminApi } from '@/features/admin/client';
import type { SuggestedRelationship } from '@/features/admin/types';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';

const keyOf = (s: SuggestedRelationship) => `${s.kind}:${s.viaLocalKeys.join('-')}`;

export function SuggestedRelationshipsTab({ submissionId }: { submissionId: string }) {
  const queryClient = useQueryClient();
  const [skipped, setSkipped] = useState<Set<string>>(new Set());

  const { data, isLoading, error } = useQuery({
    queryKey: ['admin', 'suggested', submissionId],
    queryFn: () => adminApi.get<{ items: SuggestedRelationship[] }>(`/api/admin/submissions/${submissionId}/suggested-relationships`),
  });

  const confirm = useMutation({
    mutationFn: (body: unknown) => adminApi.post(`/api/admin/submissions/${submissionId}/confirm-relationship`, body),
    onSuccess: () => {
      toast.success('Връзката е потвърдена');
      void queryClient.invalidateQueries({ queryKey: ['admin', 'suggested', submissionId] });
    },
    // Cycle (422) and conflicts (409) surface as Bulgarian toasts.
    onError: (err: Error) => toast.error(err.message),
  });

  if (isLoading) return <p className="text-sm text-muted-foreground">Зареждане…</p>;
  if (error) return <p className="text-sm text-destructive">Грешка при зареждане.</p>;

  const items = (data?.items ?? []).filter((s) => !skipped.has(keyOf(s)));
  if (items.length === 0) return <p className="text-sm text-muted-foreground">Няма предложени връзки.</p>;

  return (
    <ul className="space-y-2">
      {items.map((s) => (
        <li key={keyOf(s)} className="flex flex-wrap items-center justify-between gap-2 rounded-md border p-3">
          <SuggestionLabel s={s} />
          <div className="flex items-center gap-2">
            {s.status === 'already_exists' && <Badge variant="secondary">Вече съществува ✓</Badge>}
            {s.status === 'missing_person' && (
              <Badge variant="outline" className="font-normal">
                Липсва: {s.missingLocalKeys.join(', ')}
              </Badge>
            )}
            {s.status === 'ready' && s.kind !== 'sibling_hint' && (
              <>
                <Button
                  size="sm"
                  disabled={confirm.isPending}
                  onClick={() =>
                    confirm.mutate(
                      s.kind === 'parent_child'
                        ? { kind: 'parent_child', parentPersonId: s.a.personId, childPersonId: s.b.personId, relationshipType: s.relationshipType }
                        : { kind: 'union', partnerPersonIds: [s.a.personId, s.b.personId] },
                    )
                  }
                >
                  Потвърди
                </Button>
                <Button variant="ghost" size="sm" onClick={() => setSkipped((prev) => new Set(prev).add(keyOf(s)))}>
                  Пропусни
                </Button>
              </>
            )}
          </div>
        </li>
      ))}
    </ul>
  );
}

function SuggestionLabel({ s }: { s: SuggestedRelationship }) {
  if (s.kind === 'parent_child') {
    return (
      <span className="text-sm">
        <span className="font-medium">{s.a.label}</span> <span className="text-muted-foreground">(родител)</span>
        {' → '}
        <span className="font-medium">{s.b.label}</span> <span className="text-muted-foreground">(дете)</span>
      </span>
    );
  }
  if (s.kind === 'union') {
    return (
      <span className="text-sm">
        <span className="font-medium">{s.a.label}</span> ↔ <span className="font-medium">{s.b.label}</span>{' '}
        <span className="text-muted-foreground">(съюз)</span>
      </span>
    );
  }
  // sibling_hint — siblings derive from shared parents, never a stored edge.
  return (
    <span className="text-sm text-muted-foreground">
      <span className="font-medium text-foreground">{s.a.label}</span> и{' '}
      <span className="font-medium text-foreground">{s.b.label}</span> — общи родители (не се създава пряка връзка)
    </span>
  );
}
