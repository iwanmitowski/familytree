'use client';

import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { adminApi } from '@/features/admin/client';
import type { PersonAggregate } from './types';
import { renderLifespan } from './labels';
import { MergeDialog } from './MergeDialog';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent } from '@/components/ui/card';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';

export function PersonHeaderCard({ person }: { person: PersonAggregate }) {
  const queryClient = useQueryClient();
  const invalidate = () => queryClient.invalidateQueries({ queryKey: ['admin', 'person', person.id] });
  const [notes, setNotes] = useState(person.notes ?? '');

  const patch = useMutation({
    mutationFn: (body: Record<string, unknown>) => adminApi.patch(`/api/admin/people/${person.id}`, body),
    onSuccess: () => { toast.success('Запазено'); void invalidate(); },
    onError: (err: Error) => toast.error(err.message),
  });

  const birth = person.events.find((e) => e.event_type === 'birth')?.year_from ?? null;
  const death = person.events.find((e) => e.event_type === 'death')?.year_from ?? null;

  return (
    <Card>
      <CardContent className="space-y-4 pt-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">{person.label || 'Без име'}</h1>
            <p className="text-muted-foreground">{renderLifespan(birth, death)}</p>
          </div>
          <MergeDialog source={person} />
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1">
            <Label>Поверителност</Label>
            <Select value={person.privacyLevel} onValueChange={(v) => patch.mutate({ privacyLevel: v })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="private">Частно</SelectItem>
                <SelectItem value="family">Семейно</SelectItem>
                <SelectItem value="public">Публично</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label>Статус</Label>
            <Select value={person.livingStatus} onValueChange={(v) => patch.mutate({ livingStatus: v })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="unknown">Неизвестно</SelectItem>
                <SelectItem value="living">Жив/а</SelectItem>
                <SelectItem value="deceased">Починал/а</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        <div className="space-y-1">
          <Label htmlFor="person-notes">Бележки</Label>
          <Textarea id="person-notes" value={notes} onChange={(e) => setNotes(e.target.value)} />
          <div className="flex justify-end">
            <Button
              variant="outline"
              size="sm"
              disabled={notes === (person.notes ?? '') || patch.isPending}
              onClick={() => patch.mutate({ notes: notes.trim() || null })}
            >
              Запази бележки
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
