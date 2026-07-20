'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { adminApi } from '@/features/admin/client';
import {
  LIVING_STATUS_LABELS,
  PRIVACY_LABELS,
  label as toLabel,
  renderLifespan,
} from '@/features/people/labels';
import type { PersonSummary } from '@/features/people/types';
import { NewPersonDialog } from '@/features/people/NewPersonDialog';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';

const LIVING_FILTERS = ['all', 'living', 'deceased', 'unknown'] as const;
const PRIVACY_FILTERS = ['all', 'private', 'family', 'public'] as const;

export default function PeoplePage() {
  const [query, setQuery] = useState('');
  const [debounced, setDebounced] = useState('');
  const [living, setLiving] = useState<(typeof LIVING_FILTERS)[number]>('all');
  const [privacy, setPrivacy] = useState<(typeof PRIVACY_FILTERS)[number]>('all');

  useEffect(() => {
    const t = setTimeout(() => setDebounced(query.trim()), 250);
    return () => clearTimeout(t);
  }, [query]);

  const { data, isLoading, error } = useQuery({
    queryKey: ['admin', 'people', 'list', debounced],
    queryFn: () =>
      adminApi.get<{ items: PersonSummary[] }>(`/api/admin/people?q=${encodeURIComponent(debounced)}`),
  });

  // The API paginates by name; living/privacy narrow the loaded page client-side.
  const items = (data?.items ?? []).filter(
    (p) => (living === 'all' || p.livingStatus === living) && (privacy === 'all' || p.privacyLevel === privacy),
  );

  return (
    <div>
      <div className="mb-6 flex items-center justify-between gap-4">
        <h1 className="text-2xl font-semibold tracking-tight">Хора</h1>
        <NewPersonDialog />
      </div>

      <div className="mb-4 space-y-3">
        <Input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Търсене по име (кирилица или латиница)…"
          aria-label="Търсене по име"
        />
        <div className="flex flex-wrap gap-2">
          {LIVING_FILTERS.map((f) => (
            <FilterChip key={f} active={living === f} onClick={() => setLiving(f)}>
              {f === 'all' ? 'Всички' : toLabel(LIVING_STATUS_LABELS, f)}
            </FilterChip>
          ))}
          <span className="mx-1 self-center text-muted-foreground">·</span>
          {PRIVACY_FILTERS.map((f) => (
            <FilterChip key={f} active={privacy === f} onClick={() => setPrivacy(f)}>
              {f === 'all' ? 'Всяка поверителност' : toLabel(PRIVACY_LABELS, f)}
            </FilterChip>
          ))}
        </div>
      </div>

      {isLoading && <p className="text-sm text-muted-foreground">Зареждане…</p>}
      {error && <p className="text-sm text-destructive">Грешка при зареждане.</p>}

      {data && (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Име</TableHead>
              <TableHead>Години</TableHead>
              <TableHead>Статус</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {items.length === 0 && (
              <TableRow>
                <TableCell colSpan={3} className="text-center text-muted-foreground">
                  Няма намерени хора.
                </TableCell>
              </TableRow>
            )}
            {items.map((p) => (
              <TableRow key={p.id}>
                <TableCell>
                  <Link href={`/admin/people/${p.id}`} className="font-medium hover:underline">
                    {p.label || 'Без име'}
                  </Link>
                </TableCell>
                <TableCell className="whitespace-nowrap text-sm text-muted-foreground">
                  {renderLifespan(p.birthYear, p.deathYear)}
                </TableCell>
                <TableCell className="space-x-1">
                  <Badge variant={p.livingStatus === 'living' ? 'default' : 'secondary'}>
                    {toLabel(LIVING_STATUS_LABELS, p.livingStatus)}
                  </Badge>
                  {p.privacyLevel === 'private' && <Badge variant="outline">Частно</Badge>}
                  {p.merged && <Badge variant="destructive">Слят</Badge>}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </div>
  );
}

function FilterChip({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-md px-3 py-1.5 text-sm ${
        active ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground'
      }`}
    >
      {children}
    </button>
  );
}
