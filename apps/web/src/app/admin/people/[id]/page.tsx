'use client';

import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { adminApi } from '@/features/admin/client';
import type { PersonAggregate } from '@/features/people/types';
import {
  EVENT_TYPE_LABELS,
  NAME_TYPE_LABELS,
  label as toLabel,
  renderEventDate,
} from '@/features/people/labels';
import { PersonHeaderCard } from '@/features/people/PersonHeaderCard';
import { RelationshipsTab } from '@/features/people/RelationshipsTab';
import { UnionsTab } from '@/features/people/UnionsTab';
import { SourcesTab } from '@/features/people/SourcesTab';
import { FilesTab } from '@/features/people/FilesTab';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';

type PersonResponse = PersonAggregate | { merged: true; mergedIntoPersonId: string };

export default function PersonPage() {
  const id = useParams<{ id: string }>().id;

  const { data, isLoading, error } = useQuery({
    queryKey: ['admin', 'person', id],
    queryFn: () => adminApi.get<PersonResponse>(`/api/admin/people/${id}`),
  });

  if (isLoading) return <p className="text-sm text-muted-foreground">Зареждане…</p>;
  if (error) return <p className="text-sm text-destructive">Грешка при зареждане.</p>;
  if (!data) return null;

  if ('merged' in data) return <MergedBanner targetId={data.mergedIntoPersonId} />;

  const person = data;

  return (
    <div className="space-y-6">
      <Link href="/admin/people" className="text-sm text-muted-foreground hover:underline">← Хора</Link>
      <PersonHeaderCard person={person} />

      <Tabs defaultValue="relationships">
        <TabsList className="flex-wrap">
          <TabsTrigger value="names">Имена</TabsTrigger>
          <TabsTrigger value="events">Събития</TabsTrigger>
          <TabsTrigger value="relationships">Връзки</TabsTrigger>
          <TabsTrigger value="unions">Съюзи</TabsTrigger>
          <TabsTrigger value="sources">Източници</TabsTrigger>
          <TabsTrigger value="files">Файлове</TabsTrigger>
          <TabsTrigger value="history">История</TabsTrigger>
        </TabsList>

        <TabsContent value="names" className="pt-4">
          {person.names.length === 0 ? (
            <p className="text-sm text-muted-foreground">Няма имена.</p>
          ) : (
            <ul className="space-y-2">
              {person.names.map((n) => (
                <li key={n.id} className="flex items-center justify-between rounded-md border p-2">
                  <span className="font-medium">
                    {[n.first_name, n.middle_name, n.surname].filter(Boolean).join(' ') || n.nickname || '—'}
                  </span>
                  <span className="space-x-1">
                    <Badge variant="outline">{toLabel(NAME_TYPE_LABELS, n.name_type)}</Badge>
                    {n.is_preferred && <Badge>Предпочитано</Badge>}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </TabsContent>

        <TabsContent value="events" className="pt-4">
          {person.events.length === 0 ? (
            <p className="text-sm text-muted-foreground">Няма събития.</p>
          ) : (
            <ul className="space-y-2">
              {person.events.map((e) => (
                <li key={e.id} className="flex items-center justify-between rounded-md border p-2 text-sm">
                  <span className="font-medium">{toLabel(EVENT_TYPE_LABELS, e.event_type)}</span>
                  <span className="text-muted-foreground">
                    {renderEventDate(e)}
                    {e.place_label ? ` · ${e.place_label}` : ''}
                    {e.value ? ` · ${e.value}` : ''}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </TabsContent>

        <TabsContent value="relationships" className="pt-4">
          <RelationshipsTab person={person} />
        </TabsContent>

        <TabsContent value="unions" className="pt-4">
          <UnionsTab person={person} />
        </TabsContent>

        <TabsContent value="sources" className="pt-4">
          <SourcesTab personId={person.id} sourceCount={person.sourceCount} />
        </TabsContent>

        <TabsContent value="files" className="pt-4">
          <FilesTab personId={person.id} />
        </TabsContent>

        <TabsContent value="history" className="pt-4">
          {person.mergeHistory.length === 0 ? (
            <p className="text-sm text-muted-foreground">Няма сливания в историята.</p>
          ) : (
            <ul className="space-y-2">
              {person.mergeHistory.map((m) => (
                <li key={m.id} className="rounded-md border p-2 text-sm">
                  <p className="text-muted-foreground">
                    {new Date(m.created_at).toLocaleString('bg-BG')} · {m.actor_id}
                  </p>
                  <p>Слят запис: {m.source_person_id}</p>
                  <p className="text-muted-foreground">Причина: {m.reason}</p>
                </li>
              ))}
            </ul>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}

function MergedBanner({ targetId }: { targetId: string }) {
  const { data } = useQuery({
    queryKey: ['admin', 'person', targetId],
    queryFn: () => adminApi.get<PersonAggregate>(`/api/admin/people/${targetId}`),
  });
  return (
    <div className="space-y-3">
      <Link href="/admin/people" className="text-sm text-muted-foreground hover:underline">← Хора</Link>
      <div className="rounded-md border border-amber-500/50 bg-amber-50 p-4 text-sm dark:bg-amber-950/30">
        <p className="mb-2 font-medium">Този запис е слят с друг.</p>
        <Link href={`/admin/people/${targetId}`} className="text-primary hover:underline">
          Слят с: {'label' in (data ?? {}) ? (data as PersonAggregate).label : 'активния запис'} →
        </Link>
      </div>
    </div>
  );
}
