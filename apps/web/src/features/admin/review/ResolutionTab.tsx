'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { adminApi } from '@/features/admin/client';
import { RESOLUTION_LABELS, type RankedCandidate, type SubmissionPerson } from '@/features/admin/types';
import { PersonPicker } from '@/features/people/PersonPicker';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Textarea } from '@/components/ui/textarea';
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger,
} from '@/components/ui/dialog';

const RESOLUTION_VARIANT: Record<string, 'default' | 'secondary' | 'outline'> = {
  pending: 'secondary',
  created: 'default',
  linked: 'default',
  deferred: 'outline',
  ignored: 'outline',
};

export function ResolutionTab({ submissionId, people }: { submissionId: string; people: SubmissionPerson[] }) {
  return (
    <div className="space-y-4">
      {people.map((p) => (
        <ResolutionCard key={p.id} submissionId={submissionId} person={p} />
      ))}
    </div>
  );
}

function ResolutionCard({ submissionId, person }: { submissionId: string; person: SubmissionPerson }) {
  const queryClient = useQueryClient();
  const [candidates, setCandidates] = useState<RankedCandidate[] | null>(null);
  const [linking, setLinking] = useState(false);

  const invalidate = () => {
    void queryClient.invalidateQueries({ queryKey: ['admin', 'submission', submissionId] });
    void queryClient.invalidateQueries({ queryKey: ['admin', 'suggested', submissionId] });
  };

  const findMatches = useMutation({
    mutationFn: () => adminApi.post<{ candidates: RankedCandidate[] }>(`/api/admin/submission-people/${person.id}/find-matches`),
    onSuccess: (data) => {
      setCandidates(data.candidates);
      if (data.candidates.length === 0) toast.info('Няма намерени съвпадения');
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const createPerson = useMutation({
    mutationFn: () => adminApi.post(`/api/admin/submission-people/${person.id}/create-person`),
    onSuccess: () => { toast.success('Създаден нов човек'); invalidate(); },
    onError: (err: Error) => toast.error(err.message),
  });

  const linkPerson = useMutation({
    mutationFn: (personId: string) => adminApi.post(`/api/admin/submission-people/${person.id}/link-person`, { personId }),
    onSuccess: () => { toast.success('Свързан със съществуващ човек'); setLinking(false); invalidate(); },
    onError: (err: Error) => toast.error(err.message),
  });

  const defer = useMutation({
    mutationFn: () => adminApi.post(`/api/admin/submission-people/${person.id}/defer`, {}),
    onSuccess: () => { toast.success('Отложен за по-късно'); invalidate(); },
    onError: (err: Error) => toast.error(err.message),
  });

  const ignore = useMutation({
    mutationFn: (reason: string | undefined) => adminApi.post(`/api/admin/submission-people/${person.id}/ignore`, { reason }),
    onSuccess: () => { toast.success('Игнориран'); invalidate(); },
    onError: (err: Error) => toast.error(err.message),
  });

  const status = person.resolution_status ?? 'pending';
  const name = [person.first_name, person.middle_name, person.surname].filter(Boolean).join(' ') || person.nickname || '—';
  const years = person.birth_year_from
    ? `${person.birth_year_from}${person.death_year_from ? ` – ${person.death_year_from}` : ''}`
    : '';
  const resolved = status === 'created' || status === 'linked';
  const actionable = status === 'pending' || status === 'deferred';

  return (
    <Card>
      <CardContent className="space-y-3 pt-6">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div>
            <div className="flex items-center gap-2">
              <span className="font-mono text-xs text-muted-foreground">{person.localKey}</span>
              <span className="font-medium">{name}</span>
            </div>
            <p className="text-sm text-muted-foreground">
              {[years, person.birthplace_text].filter(Boolean).join(' · ') || 'без данни за години/място'}
            </p>
          </div>
          <Badge variant={RESOLUTION_VARIANT[status] ?? 'secondary'}>{RESOLUTION_LABELS[status] ?? status}</Badge>
        </div>

        {resolved && person.matched_person_id && (
          <Link href={`/admin/people/${person.matched_person_id}`} className="inline-block text-sm text-primary hover:underline">
            Виж свързания човек →
          </Link>
        )}

        {actionable && (
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" size="sm" disabled={findMatches.isPending} onClick={() => findMatches.mutate()}>
              Намери съвпадения
            </Button>
            <CreatePersonDialog onConfirm={() => createPerson.mutate()} pending={createPerson.isPending} />
            <Button variant="outline" size="sm" onClick={() => setLinking((v) => !v)}>
              {linking ? 'Отказ' : 'Свържи със съществуващ'}
            </Button>
            <Button variant="ghost" size="sm" disabled={defer.isPending} onClick={() => defer.mutate()}>
              Остави за по-късно
            </Button>
            <IgnoreDialog onConfirm={(reason) => ignore.mutate(reason)} pending={ignore.isPending} />
          </div>
        )}

        {linking && (
          <div className="rounded-md border p-3">
            <PersonPicker placeholder="Търсене на съществуващ човек…" onSelect={(p) => linkPerson.mutate(p.id)} />
          </div>
        )}

        {candidates && candidates.length > 0 && (
          <ul className="space-y-2">
            {candidates.map((c) => (
              <li key={c.id} className="rounded-md border p-3">
                <div className="flex items-center justify-between gap-2">
                  <Link href={`/admin/people/${c.canonicalPersonId}`} className="font-medium hover:underline">
                    {c.person.label || 'Без име'}{c.person.birthYear ? ` (${c.person.birthYear})` : ''}
                  </Link>
                  <Button size="sm" disabled={linkPerson.isPending} onClick={() => linkPerson.mutate(c.canonicalPersonId)}>
                    Свържи
                  </Button>
                </div>
                <div className="mt-2 flex items-center gap-2">
                  <div className="h-2 w-24 overflow-hidden rounded bg-muted">
                    <div className="h-full bg-primary" style={{ width: `${Math.min(100, c.score)}%` }} />
                  </div>
                  <span className="text-xs text-muted-foreground">{c.score}</span>
                </div>
                <div className="mt-2 flex flex-wrap gap-1">
                  {c.reasons.map((r, i) => (
                    <Badge key={i} variant="outline" className="font-normal">{r.description}</Badge>
                  ))}
                </div>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}

function CreatePersonDialog({ onConfirm, pending }: { onConfirm: () => void; pending: boolean }) {
  const [open, setOpen] = useState(false);
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm">Създай нов човек</Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Създаване на нов човек</DialogTitle>
        </DialogHeader>
        <p className="text-sm text-muted-foreground">
          Ще се създаде нов запис в родословието от данните в заявката (частен по подразбиране).
        </p>
        <DialogFooter>
          <Button disabled={pending} onClick={() => { onConfirm(); setOpen(false); }}>Създай</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function IgnoreDialog({ onConfirm, pending }: { onConfirm: (reason: string | undefined) => void; pending: boolean }) {
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState('');
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="ghost" size="sm" className="text-destructive">Игнорирай</Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Игнориране на този човек</DialogTitle>
        </DialogHeader>
        <Textarea placeholder="Причина (по избор)" value={reason} onChange={(e) => setReason(e.target.value)} />
        <DialogFooter>
          <Button
            variant="destructive"
            disabled={pending}
            onClick={() => { onConfirm(reason.trim() || undefined); setOpen(false); setReason(''); }}
          >
            Игнорирай
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
