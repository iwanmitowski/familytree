'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { adminApi } from '@/features/admin/client';
import type { PersonAggregate, RelationshipEdge } from './types';
import { RELATIONSHIP_TYPE_LABELS, VERIFICATION_LABELS, label as toLabel } from './labels';
import { PersonPicker } from './PersonPicker';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';

const VERIFICATION_VARIANT: Record<string, 'default' | 'secondary' | 'outline' | 'destructive'> = {
  proposed: 'secondary',
  confirmed: 'default',
  disputed: 'destructive',
  rejected: 'outline',
};

export function RelationshipsTab({ person }: { person: PersonAggregate }) {
  const queryClient = useQueryClient();
  const invalidate = () => queryClient.invalidateQueries({ queryKey: ['admin', 'person', person.id] });

  const patch = useMutation({
    mutationFn: ({ id, verificationStatus }: { id: string; verificationStatus: string }) =>
      adminApi.patch(`/api/admin/relationships/${id}`, { verificationStatus }),
    onSuccess: () => { toast.success('Обновено'); void invalidate(); },
    onError: (err: Error) => toast.error(err.message),
  });

  const remove = useMutation({
    mutationFn: (id: string) => adminApi.del(`/api/admin/relationships/${id}`),
    onSuccess: () => { toast.success('Изтрито'); void invalidate(); },
    onError: (err: Error) => toast.error(err.message),
  });

  const create = useMutation({
    mutationFn: (vars: { parentId: string; childId: string }) =>
      adminApi.post('/api/admin/relationships', { ...vars, verificationStatus: 'proposed' }),
    onSuccess: () => { toast.success('Връзката е добавена'); void invalidate(); },
    // Cycle rejection (422) and duplicates (409) surface as Bulgarian toasts.
    onError: (err: Error) => toast.error(err.message),
  });

  return (
    <div className="space-y-8">
      <EdgeGroup
        title="Родители"
        edges={person.parents}
        emptyText="Няма добавени родители."
        onConfirm={(id) => patch.mutate({ id, verificationStatus: 'confirmed' })}
        onDispute={(id) => patch.mutate({ id, verificationStatus: 'disputed' })}
        onDelete={(id) => remove.mutate(id)}
        addLabel="Добави родител"
        onAdd={(personId) => create.mutate({ parentId: personId, childId: person.id })}
        excludeId={person.id}
        pending={create.isPending}
      />
      <EdgeGroup
        title="Деца"
        edges={person.children}
        emptyText="Няма добавени деца."
        onConfirm={(id) => patch.mutate({ id, verificationStatus: 'confirmed' })}
        onDispute={(id) => patch.mutate({ id, verificationStatus: 'disputed' })}
        onDelete={(id) => remove.mutate(id)}
        addLabel="Добави дете"
        onAdd={(personId) => create.mutate({ parentId: person.id, childId: personId })}
        excludeId={person.id}
        pending={create.isPending}
      />
    </div>
  );
}

function EdgeGroup({
  title, edges, emptyText, onConfirm, onDispute, onDelete, addLabel, onAdd, excludeId, pending,
}: {
  title: string;
  edges: RelationshipEdge[];
  emptyText: string;
  onConfirm: (id: string) => void;
  onDispute: (id: string) => void;
  onDelete: (id: string) => void;
  addLabel: string;
  onAdd: (personId: string) => void;
  excludeId: string;
  pending: boolean;
}) {
  const [adding, setAdding] = useState(false);

  return (
    <section>
      <div className="mb-2 flex items-center justify-between">
        <h3 className="text-lg font-medium">{title}</h3>
        <Button variant="outline" size="sm" onClick={() => setAdding((a) => !a)}>
          {adding ? 'Отказ' : addLabel}
        </Button>
      </div>

      {adding && (
        <div className="mb-3 rounded-md border p-3">
          <PersonPicker
            excludeId={excludeId}
            placeholder="Търсене на човек за добавяне…"
            onSelect={(p) => { onAdd(p.id); setAdding(false); }}
          />
          {pending && <p className="mt-1 text-sm text-muted-foreground">Добавяне…</p>}
        </div>
      )}

      {edges.length === 0 ? (
        <p className="text-sm text-muted-foreground">{emptyText}</p>
      ) : (
        <ul className="space-y-2">
          {edges.map((e) => (
            <li key={e.id} className="flex flex-wrap items-center justify-between gap-2 rounded-md border p-2">
              <div className="flex items-center gap-2">
                <Link href={`/admin/people/${e.counterpartId}`} className="font-medium hover:underline">
                  {e.counterpartLabel}
                </Link>
                <Badge variant="outline">{toLabel(RELATIONSHIP_TYPE_LABELS, e.relationship_type)}</Badge>
                <Badge variant={VERIFICATION_VARIANT[e.verification_status] ?? 'secondary'}>
                  {toLabel(VERIFICATION_LABELS, e.verification_status)}
                </Badge>
              </div>
              <div className="flex gap-1">
                {e.verification_status !== 'confirmed' && (
                  <Button variant="ghost" size="sm" onClick={() => onConfirm(e.id)}>Потвърди</Button>
                )}
                {e.verification_status !== 'disputed' && (
                  <Button variant="ghost" size="sm" onClick={() => onDispute(e.id)}>Оспори</Button>
                )}
                <Button variant="ghost" size="sm" className="text-destructive" onClick={() => onDelete(e.id)}>
                  Изтрий
                </Button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
