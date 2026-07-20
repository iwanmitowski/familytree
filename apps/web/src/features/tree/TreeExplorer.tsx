'use client';

import { useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { adminApi } from '@/features/admin/client';
import { PersonPicker } from '@/features/people/PersonPicker';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { TreeCanvas } from './TreeCanvas';
import type { TreeProjection } from './types';

const PROJECTION_QS = 'ancestors=4&descendants=3&includePartners=true&includeSiblings=true';

async function fetchPublicTree(root: string): Promise<TreeProjection> {
  const res = await fetch(`/api/tree/${root}?${PROJECTION_QS}`);
  const text = await res.text();
  const body = text ? JSON.parse(text) : null;
  if (!res.ok) throw new Error((body as { error?: { message?: string } })?.error?.message ?? 'Грешка');
  return body as TreeProjection;
}

export function TreeExplorer({ view }: { view: 'public' | 'admin' }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const root = searchParams.get('root');

  const setRoot = (id: string) => router.replace(`?root=${encodeURIComponent(id)}`, { scroll: false });

  const { data, isLoading, error, refetch, isFetching } = useQuery({
    queryKey: ['tree', view, root],
    queryFn: () =>
      view === 'admin'
        ? adminApi.get<TreeProjection>(`/api/admin/tree/${root}?${PROJECTION_QS}`)
        : fetchPublicTree(root!),
    enabled: !!root,
  });

  return (
    <div className="flex h-[calc(100vh-8rem)] flex-col gap-3">
      <div className="flex flex-wrap items-center gap-3">
        <div className="w-full max-w-sm">
          {view === 'admin' ? (
            <PersonPicker placeholder="Търсене на корен…" onSelect={(p) => setRoot(p.id)} />
          ) : (
            <PublicRootSearch onSelect={setRoot} />
          )}
        </div>
        {root && (
          <Button variant="ghost" size="sm" onClick={() => refetch()}>
            Обнови
          </Button>
        )}
        {data?.truncated && <Badge variant="outline">Показани са първите 400 възела</Badge>}
      </div>

      <div className="relative min-h-0 flex-1 overflow-hidden rounded-lg border">
        {!root && <Centered>Изберете човек, за да видите дървото.</Centered>}
        {root && (isLoading || isFetching) && !data && <Centered>Зареждане…</Centered>}
        {root && error && (
          <Centered>
            <p className="mb-2 text-destructive">Грешка при зареждане.</p>
            <Button size="sm" variant="outline" onClick={() => refetch()}>
              Опитай отново
            </Button>
          </Centered>
        )}
        {root && data && data.nodes.length === 0 && <Centered>Няма данни за показване.</Centered>}
        {root && data && data.nodes.length > 0 && <TreeCanvas projection={data} />}
      </div>
    </div>
  );
}

function Centered({ children }: { children: React.ReactNode }) {
  return (
    <div className="absolute inset-0 flex flex-col items-center justify-center p-6 text-center text-sm text-muted-foreground">
      {children}
    </div>
  );
}

interface PublicHit {
  id: string;
  label: string;
  birthYear: number | null;
}

function PublicRootSearch({ onSelect }: { onSelect: (id: string) => void }) {
  const [query, setQuery] = useState('');
  const [debounced, setDebounced] = useState('');

  useEffect(() => {
    const t = setTimeout(() => setDebounced(query.trim()), 250);
    return () => clearTimeout(t);
  }, [query]);

  const { data, isFetching } = useQuery({
    queryKey: ['tree', 'public-search', debounced],
    queryFn: async () => {
      const res = await fetch(`/api/tree/search?q=${encodeURIComponent(debounced)}`);
      return (await res.json()) as { items: PublicHit[] };
    },
    enabled: debounced.length >= 2,
  });

  const items = data?.items ?? [];

  return (
    <div className="space-y-2">
      <Input
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Търсене на човек…"
        aria-label="Търсене на човек"
      />
      {debounced.length >= 2 && (
        <div className="max-h-56 overflow-y-auto rounded-md border">
          {isFetching && <p className="p-2 text-sm text-muted-foreground">Търсене…</p>}
          {!isFetching && items.length === 0 && <p className="p-2 text-sm text-muted-foreground">Няма съвпадения.</p>}
          <ul>
            {items.map((p) => (
              <li key={p.id}>
                <button
                  type="button"
                  onClick={() => onSelect(p.id)}
                  className="flex w-full items-center justify-between gap-2 px-3 py-2 text-left text-sm hover:bg-muted"
                >
                  <span className="font-medium">{p.label || 'Без име'}</span>
                  {p.birthYear && <span className="text-muted-foreground">{p.birthYear}</span>}
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
