'use client';

import { useEffect, useMemo, useReducer, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { adminApi } from '@/features/admin/client';
import { PersonPicker } from '@/features/people/PersonPicker';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { TreeCanvas } from './TreeCanvas';
import { SidePanel } from './SidePanel';
import { MobilePedigree } from './MobilePedigree';
import { useMediaQuery } from './use-media-query';
import { mergeProjections, computeHidden, visibleProjection, collapsibleIds } from './graph-ops';
import { computeHighlight, pathReducer, initialPathState, type RelationshipResult } from './highlight';
import { VIEW_MODES, projectionQuery, type ViewMode } from './view-mode';
import type { TreeNode, TreeProjection } from './types';

async function getJson<T>(url: string): Promise<T> {
  const res = await fetch(url);
  const text = await res.text();
  const body = text ? JSON.parse(text) : null;
  if (!res.ok) throw new Error((body as { error?: { message?: string } })?.error?.message ?? 'Грешка');
  return body as T;
}

export function TreeExplorer({ view }: { view: 'public' | 'admin' }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const root = searchParams.get('root');
  const isMobile = useMediaQuery('(max-width: 767px)');

  const [mode, setMode] = useState<ViewMode>('combined');
  const [depth, setDepth] = useState(4);
  const projKey = `${root}|${mode}|${depth}`;

  const [extra, setExtra] = useState<Record<string, TreeProjection[]>>({});
  const [collapsedByKey, setCollapsedByKey] = useState<Record<string, string[]>>({});
  const [selected, setSelected] = useState<TreeNode | null>(null);
  const [path, dispatch] = useReducer(pathReducer, initialPathState);

  const setRoot = (id: string) => {
    router.replace(`?root=${encodeURIComponent(id)}`, { scroll: false });
    setSelected(null);
    dispatch({ type: 'clear' });
  };

  const fetchProjection = (id: string, qs: string) =>
    view === 'admin' ? adminApi.get<TreeProjection>(`/api/admin/tree/${id}?${qs}`) : getJson<TreeProjection>(`/api/tree/${id}?${qs}`);

  const baseQuery = useQuery({
    queryKey: ['tree', view, projKey],
    queryFn: () => fetchProjection(root!, projectionQuery(mode, depth)),
    enabled: !!root,
  });

  const full = useMemo(() => {
    if (!baseQuery.data) return null;
    return (extra[projKey] ?? []).reduce((acc, p) => mergeProjections(acc, p), baseQuery.data);
  }, [baseQuery.data, extra, projKey]);

  const collapsed = useMemo(() => new Set(collapsedByKey[projKey] ?? []), [collapsedByKey, projKey]);

  const { visible, collapsibles, boundary } = useMemo(() => {
    if (!full) return { visible: null as TreeProjection | null, collapsibles: new Set<string>(), boundary: new Set<string>() };
    const hidden = computeHidden(full, collapsed);
    const vis = visibleProjection(full, hidden);
    const persons = vis.nodes.filter((n) => n.type === 'person');
    const gens = persons.map((n) => n.generation);
    const minG = Math.min(...gens);
    const maxG = Math.max(...gens);
    const boundaryIds = new Set(
      persons.filter((n) => (n.generation === minG || n.generation === maxG) && n.id !== vis.rootPersonId).map((n) => n.id),
    );
    return { visible: vis, collapsibles: collapsibleIds(full), boundary: boundaryIds };
  }, [full, collapsed]);

  // Relationship path result (admin returns the path; public only label + confidence).
  const relQuery = useQuery({
    queryKey: ['tree', 'rel', view, path.a, path.b],
    queryFn: () =>
      view === 'admin'
        ? adminApi.get<RelationshipResult>(`/api/admin/relationship?personA=${path.a}&personB=${path.b}`)
        : getJson<RelationshipResult>(`/api/relationship?personA=${path.a}&personB=${path.b}`),
    enabled: !!path.a && !!path.b,
  });
  const relResult = relQuery.data ?? null;

  const highlight = useMemo(() => {
    if (!visible || !relResult?.path?.length) return null;
    const ids = [path.a!, path.b!, ...relResult.path.map((s) => s.personId)];
    return computeHighlight(visible, ids);
  }, [visible, relResult, path.a, path.b]);

  const toggleCollapse = (id: string) =>
    setCollapsedByKey((prev) => {
      const cur = new Set(prev[projKey] ?? []);
      if (cur.has(id)) cur.delete(id);
      else cur.add(id);
      return { ...prev, [projKey]: [...cur] };
    });

  const loadMore = async (id: string) => {
    const p = await fetchProjection(id, projectionQuery('combined', 2));
    setExtra((prev) => ({ ...prev, [projKey]: [...(prev[projKey] ?? []), p] }));
  };

  const onSelect = (node: TreeNode) => {
    if (path.active) dispatch({ type: 'pick', id: node.id });
    else setSelected(node);
  };

  const personCount = visible?.nodes.filter((n) => n.type === 'person').length ?? 0;

  return (
    <div className="flex h-[calc(100vh-8rem)] flex-col gap-3">
      <div className="flex flex-wrap items-center gap-3">
        <div className="w-full max-w-sm sm:w-auto sm:flex-1">
          {view === 'admin' ? (
            <PersonPicker placeholder="Търсене на корен…" onSelect={(p) => setRoot(p.id)} />
          ) : (
            <PublicRootSearch onSelect={setRoot} />
          )}
        </div>
        <div className="flex flex-wrap gap-2">
          {VIEW_MODES.map((m) => (
            <Button key={m.value} size="sm" variant={mode === m.value ? 'default' : 'outline'} onClick={() => setMode(m.value)}>
              {m.label}
            </Button>
          ))}
          <Button size="sm" variant="ghost" onClick={() => setDepth((d) => Math.min(6, d + 1))} disabled={depth >= 6}>
            Покажи още
          </Button>
          {!path.active ? (
            <Button size="sm" variant="outline" onClick={() => dispatch({ type: 'start' })}>Връзка между двама</Button>
          ) : (
            <Button size="sm" variant="ghost" onClick={() => dispatch({ type: 'clear' })}>Изчисти</Button>
          )}
        </div>
      </div>

      {path.active && <RelationshipBar path={path} result={relResult} loading={relQuery.isFetching} />}
      {personCount > 300 && (
        <Badge variant="outline" className="w-fit">Показани са {personCount} възела — може да е бавно.</Badge>
      )}

      <div className="relative min-h-0 flex-1 overflow-hidden rounded-lg border">
        {!root && <Centered>Изберете човек, за да видите дървото.</Centered>}
        {root && baseQuery.isLoading && <Centered>Зареждане…</Centered>}
        {root && baseQuery.error && (
          <Centered>
            <p className="mb-2 text-destructive">Грешка при зареждане.</p>
            <Button size="sm" variant="outline" onClick={() => baseQuery.refetch()}>Опитай отново</Button>
          </Centered>
        )}
        {root && visible && personCount === 0 && <Centered>Няма данни за показване.</Centered>}
        {root && visible && personCount > 0 && (
          isMobile ? (
            <MobilePedigree projection={visible} onReRoot={setRoot} />
          ) : (
            <>
              <TreeCanvas
                projection={visible}
                highlight={highlight}
                collapsedIds={collapsed}
                collapsibleIds={collapsibles}
                boundaryIds={boundary}
                onSelect={onSelect}
                onReRoot={setRoot}
                onToggleCollapse={toggleCollapse}
                onLoadMore={loadMore}
              />
              {selected && !path.active && (
                <SidePanel
                  node={selected}
                  view={view}
                  onClose={() => setSelected(null)}
                  onReRoot={setRoot}
                  onStartPath={(id) => { dispatch({ type: 'start' }); dispatch({ type: 'pick', id }); setSelected(null); }}
                />
              )}
            </>
          )
        )}
      </div>
    </div>
  );
}

function RelationshipBar({ path, result, loading }: { path: { a: string | null; b: string | null }; result: RelationshipResult | null; loading: boolean }) {
  return (
    <div className="rounded-md border bg-muted/40 p-3 text-sm">
      {!path.a && <p>Изберете първия човек в дървото.</p>}
      {path.a && !path.b && <p>Изберете втория човек в дървото.</p>}
      {path.a && path.b && loading && <p className="text-muted-foreground">Изчисляване…</p>}
      {path.a && path.b && !loading && result && (
        result.connected ? (
          <p>
            <span className="font-medium">Връзка:</span> {result.relationshipLabelBg}
            {result.confidence != null ? ` · увереност ${result.confidence}%` : ''}
            {result.commonAncestors && result.commonAncestors.length > 0 ? ` · общи предци: ${result.commonAncestors.length}` : ''}
          </p>
        ) : (
          <p className="text-muted-foreground">Не е намерена връзка между избраните хора.</p>
        )
      )}
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
    queryFn: () => getJson<{ items: PublicHit[] }>(`/api/tree/search?q=${encodeURIComponent(debounced)}`),
    enabled: debounced.length >= 2,
  });
  const items = data?.items ?? [];

  return (
    <div className="space-y-2">
      <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Търсене на човек…" aria-label="Търсене на човек" />
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
