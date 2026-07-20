'use client';

import { useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { adminApi } from '@/features/admin/client';
import { StatusBadge } from '@/features/admin/StatusBadge';
import type { SubmissionDetail } from '@/features/admin/types';
import { ResolutionTab } from '@/features/admin/review/ResolutionTab';
import { SuggestedRelationshipsTab } from '@/features/admin/review/SuggestedRelationshipsTab';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Textarea } from '@/components/ui/textarea';
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger,
} from '@/components/ui/dialog';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { toast } from 'sonner';

interface OriginPayload {
  origin?: { hasMaterials?: string; materialsDescription?: string };
  meta?: { durationMs?: number };
}

function ReasonDialog({
  title, actionLabel, onConfirm,
}: {
  title: string;
  actionLabel: string;
  onConfirm: (reason: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState('');
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm">{actionLabel}</Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
        </DialogHeader>
        <Textarea placeholder="Причина" value={reason} onChange={(e) => setReason(e.target.value)} />
        <DialogFooter>
          <Button
            disabled={!reason.trim()}
            onClick={() => { onConfirm(reason.trim()); setOpen(false); setReason(''); }}
          >
            Потвърди
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default function SubmissionDetailPage() {
  const id = useParams<{ id: string }>().id;
  const router = useRouter();
  const queryClient = useQueryClient();
  const [showRaw, setShowRaw] = useState(false);

  const { data, isLoading } = useQuery({
    queryKey: ['admin', 'submission', id],
    queryFn: () => adminApi.get<SubmissionDetail>(`/api/admin/submissions/${id}`),
  });

  const transition = useMutation({
    mutationFn: ({ path, body }: { path: string; body?: unknown; successMsg?: string }) =>
      adminApi.post(`/api/admin/submissions/${id}/${path}`, body),
    onSuccess: (_data, vars) => {
      toast.success(vars.successMsg ?? 'Готово');
      void queryClient.invalidateQueries({ queryKey: ['admin', 'submission', id] });
      void queryClient.invalidateQueries({ queryKey: ['admin', 'submissions'] });
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const complete = useMutation({
    mutationFn: () => adminApi.post(`/api/admin/submissions/${id}/complete`),
    onSuccess: () => {
      toast.success('Заявката е обработена');
      void queryClient.invalidateQueries({ queryKey: ['admin', 'submissions'] });
      router.push('/admin/submissions');
    },
    onError: (err: Error) => toast.error(err.message),
  });

  if (isLoading || !data) return <p className="text-sm text-muted-foreground">Зареждане…</p>;

  const payload = (data.originalPayload ?? {}) as OriginPayload;
  const materials = payload.origin?.hasMaterials;
  const hasPending = data.people.some((p) => (p.resolution_status ?? 'pending') === 'pending');
  const canComplete = data.status === 'in_review' && !hasPending;

  return (
    <div className="grid gap-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <button onClick={() => router.back()} className="mb-2 text-sm text-muted-foreground hover:underline">
            ← Обратно
          </button>
          <h1 className="text-2xl font-semibold tracking-tight">{data.participantName ?? 'Заявка'}</h1>
          <div className="mt-1"><StatusBadge status={data.status} /></div>
        </div>
        <div className="flex flex-wrap gap-2">
          {data.status === 'pending' && (
            <Button size="sm" onClick={() => transition.mutate({ path: 'start-review', successMsg: 'Прегледът започна' })}>
              Започни преглед
            </Button>
          )}
          {(data.status === 'pending' || data.status === 'in_review') && (
            <>
              <ReasonDialog
                title="Отхвърляне на заявката"
                actionLabel="Отхвърли"
                onConfirm={(reason) => transition.mutate({ path: 'reject', body: { reason }, successMsg: 'Отхвърлена' })}
              />
              <ReasonDialog
                title="Маркиране като спам"
                actionLabel="Спам"
                onConfirm={(reason) => transition.mutate({ path: 'mark-spam', body: { reason }, successMsg: 'Маркирана като спам' })}
              />
            </>
          )}
          {data.status === 'in_review' && (
            <Button
              size="sm"
              disabled={!canComplete || complete.isPending}
              title={hasPending ? 'Първо решете всички хора (създай/свържи/отложи/игнорирай)' : undefined}
              onClick={() => complete.mutate()}
            >
              Маркирай като обработена
            </Button>
          )}
        </div>
      </div>

      {materials === 'yes' && (
        <div className="rounded-md border bg-muted/40 p-3 text-sm">
          <span className="font-medium">Пази материали:</span> да
          {payload.origin?.materialsDescription ? ` — ${payload.origin.materialsDescription}` : ''}
        </div>
      )}

      <Tabs defaultValue={data.status === 'in_review' ? 'resolution' : 'overview'}>
        <TabsList className="flex-wrap">
          <TabsTrigger value="overview">Общ преглед</TabsTrigger>
          <TabsTrigger value="resolution">Резолюция</TabsTrigger>
          <TabsTrigger value="relationships">Връзки</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="space-y-6 pt-4">
          <Card>
            <CardHeader><CardTitle className="text-base">Хора ({data.people.length})</CardTitle></CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Ключ</TableHead>
                    <TableHead>Име</TableHead>
                    <TableHead>Години</TableHead>
                    <TableHead>Статус</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data.people.map((p) => (
                    <TableRow key={p.id}>
                      <TableCell className="font-mono text-xs">{p.localKey}</TableCell>
                      <TableCell>{[p.first_name, p.surname].filter(Boolean).join(' ') || '—'}</TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {p.birth_year_from ?? '—'}
                        {p.birth_year_to && p.birth_year_to !== p.birth_year_from ? `–${p.birth_year_to}` : ''}
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">{p.living_status ?? '—'}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle className="text-base">Съгласия</CardTitle></CardHeader>
            <CardContent className="text-sm">
              {data.consents.map((c, i) => (
                <div key={i} className="text-muted-foreground">
                  {c.consent_type}: {c.accepted ? 'да' : 'не'} (v{c.consent_version})
                </div>
              ))}
            </CardContent>
          </Card>

          <div className="text-xs text-muted-foreground">
            Отпечатък: {data.clientFingerprintPrefix ?? '—'} · Продължителност:{' '}
            {payload.meta?.durationMs ? `${Math.round(payload.meta.durationMs / 1000)}с` : '—'}
          </div>

          <div>
            <Button variant="link" size="sm" className="px-0" onClick={() => setShowRaw((v) => !v)}>
              {showRaw ? 'Скрий' : 'Покажи'} суров JSON
            </Button>
            {showRaw && (
              <pre className="mt-2 max-h-96 overflow-auto rounded-md border bg-muted/40 p-3 text-xs">
                {JSON.stringify(data.originalPayload, null, 2)}
              </pre>
            )}
          </div>
        </TabsContent>

        <TabsContent value="resolution" className="pt-4">
          {data.status === 'in_review' ? (
            <ResolutionTab submissionId={id} people={data.people} />
          ) : (
            <p className="text-sm text-muted-foreground">
              Резолюцията е налична, докато заявката е „В преглед“.
            </p>
          )}
        </TabsContent>

        <TabsContent value="relationships" className="pt-4">
          <SuggestedRelationshipsTab submissionId={id} />
        </TabsContent>
      </Tabs>
    </div>
  );
}
