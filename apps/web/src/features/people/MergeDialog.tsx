'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { adminApi } from '@/features/admin/client';
import type { PersonAggregate } from './types';
import { renderLifespan } from './labels';
import { PersonPicker } from './PersonPicker';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger,
} from '@/components/ui/dialog';

function summarize(p: PersonAggregate) {
  const birth = p.events.find((e) => e.event_type === 'birth')?.year_from ?? null;
  const death = p.events.find((e) => e.event_type === 'death')?.year_from ?? null;
  return {
    label: p.label,
    lifespan: renderLifespan(birth, death),
    events: p.events.length,
    relationships: p.parents.length + p.children.length,
  };
}

/**
 * Merge this (source) person into another (target). Destructive: requires a
 * reason and an explicit confirmation checkbox — no one-click path (idea.md §8).
 */
export function MergeDialog({ source }: { source: PersonAggregate }) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [targetId, setTargetId] = useState<string | null>(null);
  const [reason, setReason] = useState('');
  const [confirmed, setConfirmed] = useState(false);

  const { data: target } = useQuery({
    queryKey: ['admin', 'person', targetId],
    queryFn: () => adminApi.get<PersonAggregate>(`/api/admin/people/${targetId}`),
    enabled: !!targetId,
  });

  const merge = useMutation({
    mutationFn: () =>
      adminApi.post<PersonAggregate>(`/api/admin/people/${source.id}/merge`, {
        targetPersonId: targetId,
        reason: reason.trim(),
      }),
    onSuccess: () => {
      toast.success('Хората са слети');
      void queryClient.invalidateQueries({ queryKey: ['admin', 'people'] });
      setOpen(false);
      router.push(`/admin/people/${targetId}`);
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const reset = () => {
    setTargetId(null);
    setReason('');
    setConfirmed(false);
  };

  const src = summarize(source);

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        setOpen(o);
        if (!o) reset();
      }}
    >
      <DialogTrigger asChild>
        <Button variant="destructive" size="sm">Слей с друг човек</Button>
      </DialogTrigger>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Сливане на дубликат</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div>
            <Label>Целеви човек (остава)</Label>
            {!targetId ? (
              <PersonPicker excludeId={source.id} onSelect={(p) => setTargetId(p.id)} autoFocus />
            ) : (
              <div className="mt-1 flex items-center justify-between rounded-md border p-2 text-sm">
                <span className="font-medium">{target?.label ?? 'Зареждане…'}</span>
                <Button variant="ghost" size="sm" onClick={() => setTargetId(null)}>Смени</Button>
              </div>
            )}
          </div>

          {targetId && target && (
            <div className="grid grid-cols-2 gap-3 text-sm">
              <ComparisonCard title="Този запис (ще изчезне)" s={src} tone="source" />
              <ComparisonCard title="Целеви запис (остава)" s={summarize(target)} tone="target" />
            </div>
          )}

          <div className="space-y-1">
            <Label htmlFor="merge-reason">Причина *</Label>
            <Textarea
              id="merge-reason"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Защо тези записи са един и същи човек?"
            />
          </div>

          <label className="flex items-start gap-2 text-sm">
            <Checkbox checked={confirmed} onCheckedChange={(v) => setConfirmed(v === true)} />
            <span>Разбирам, че това действие обединява записите необратимо.</span>
          </label>
        </div>

        <DialogFooter>
          <Button
            variant="destructive"
            disabled={!targetId || !reason.trim() || !confirmed || merge.isPending}
            onClick={() => merge.mutate()}
          >
            Слей
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function ComparisonCard({
  title,
  s,
  tone,
}: {
  title: string;
  s: ReturnType<typeof summarize>;
  tone: 'source' | 'target';
}) {
  return (
    <div className={`rounded-md border p-3 ${tone === 'source' ? 'border-destructive/40' : 'border-primary/40'}`}>
      <p className="mb-1 text-xs text-muted-foreground">{title}</p>
      <p className="font-medium">{s.label || 'Без име'}</p>
      <p className="text-muted-foreground">{s.lifespan}</p>
      <p className="text-muted-foreground">Събития: {s.events} · Връзки: {s.relationships}</p>
    </div>
  );
}
