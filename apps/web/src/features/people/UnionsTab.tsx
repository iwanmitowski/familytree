'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { adminApi } from '@/features/admin/client';
import type { PersonAggregate, UnionView } from './types';
import { UNION_TYPE_LABELS, label as toLabel } from './labels';
import { PersonPicker } from './PersonPicker';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';

export function UnionsTab({ person }: { person: PersonAggregate }) {
  const queryClient = useQueryClient();
  const invalidate = () => queryClient.invalidateQueries({ queryKey: ['admin', 'person', person.id] });

  const createUnion = useMutation({
    mutationFn: () =>
      adminApi.post('/api/admin/unions', { unionType: 'marriage', partnerIds: [person.id] }),
    onSuccess: () => { toast.success('Съюзът е създаден'); void invalidate(); },
    onError: (err: Error) => toast.error(err.message),
  });

  const addPartner = useMutation({
    mutationFn: ({ unionId, personId }: { unionId: string; personId: string }) =>
      adminApi.post(`/api/admin/unions/${unionId}/partners`, { personId }),
    onSuccess: () => { toast.success('Партньорът е добавен'); void invalidate(); },
    onError: (err: Error) => toast.error(err.message),
  });

  const removePartner = useMutation({
    mutationFn: ({ unionId, personId }: { unionId: string; personId: string }) =>
      adminApi.del(`/api/admin/unions/${unionId}/partners/${personId}`),
    onSuccess: () => { toast.success('Партньорът е премахнат'); void invalidate(); },
    onError: (err: Error) => toast.error(err.message),
  });

  const deleteUnion = useMutation({
    mutationFn: (unionId: string) => adminApi.del(`/api/admin/unions/${unionId}`),
    onSuccess: () => { toast.success('Съюзът е изтрит'); void invalidate(); },
    onError: (err: Error) => toast.error(err.message),
  });

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <Button variant="outline" size="sm" disabled={createUnion.isPending} onClick={() => createUnion.mutate()}>
          Нов съюз
        </Button>
      </div>

      {person.unions.length === 0 ? (
        <p className="text-sm text-muted-foreground">Няма семейни съюзи.</p>
      ) : (
        <ul className="space-y-3">
          {person.unions.map((u) => (
            <UnionRow
              key={u.id}
              union={u}
              selfId={person.id}
              onAddPartner={(personId) => addPartner.mutate({ unionId: u.id, personId })}
              onRemovePartner={(personId) => removePartner.mutate({ unionId: u.id, personId })}
              onDelete={() => deleteUnion.mutate(u.id)}
            />
          ))}
        </ul>
      )}
    </div>
  );
}

function UnionRow({
  union, selfId, onAddPartner, onRemovePartner, onDelete,
}: {
  union: UnionView;
  selfId: string;
  onAddPartner: (personId: string) => void;
  onRemovePartner: (personId: string) => void;
  onDelete: () => void;
}) {
  const [adding, setAdding] = useState(false);
  const canAddPartner = union.partnerIds.length < 2;

  return (
    <li className="rounded-md border p-3">
      <div className="mb-2 flex items-center justify-between">
        <Badge variant="outline">{toLabel(UNION_TYPE_LABELS, union.unionType)}</Badge>
        <div className="flex gap-1">
          {canAddPartner && (
            <Button variant="ghost" size="sm" onClick={() => setAdding((a) => !a)}>
              {adding ? 'Отказ' : 'Добави партньор'}
            </Button>
          )}
          <Button variant="ghost" size="sm" className="text-destructive" onClick={onDelete}>Изтрий съюза</Button>
        </div>
      </div>

      {union.partners.length === 0 ? (
        <p className="text-sm text-muted-foreground">Само този човек в съюза.</p>
      ) : (
        <ul className="space-y-1">
          {union.partners.map((p) => (
            <li key={p.id} className="flex items-center justify-between text-sm">
              <Link href={`/admin/people/${p.id}`} className="font-medium hover:underline">{p.label}</Link>
              <Button variant="ghost" size="sm" onClick={() => onRemovePartner(p.id)}>Премахни</Button>
            </li>
          ))}
        </ul>
      )}

      {adding && (
        <div className="mt-2">
          <PersonPicker
            excludeId={selfId}
            placeholder="Търсене на партньор…"
            onSelect={(p) => { onAddPartner(p.id); setAdding(false); }}
          />
        </div>
      )}
    </li>
  );
}
