'use client';

import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { adminApi } from '@/features/admin/client';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { LIVING_STATUS_LABELS, label as toLabel } from './labels';
import type { PersonSummary } from './types';

interface PersonPickerProps {
  onSelect: (person: PersonSummary) => void;
  /** Hide this id from the results (e.g. the person being edited). */
  excludeId?: string;
  placeholder?: string;
  autoFocus?: boolean;
}

/**
 * Search-and-select a canonical person. Reused by the review workspace
 * (Task 27). Works with Cyrillic and Latin — the API does variant expansion.
 */
export function PersonPicker({ onSelect, excludeId, placeholder, autoFocus }: PersonPickerProps) {
  const [query, setQuery] = useState('');
  const [debounced, setDebounced] = useState('');

  useEffect(() => {
    const t = setTimeout(() => setDebounced(query.trim()), 250);
    return () => clearTimeout(t);
  }, [query]);

  const { data, isFetching } = useQuery({
    queryKey: ['admin', 'people', 'picker', debounced],
    queryFn: () => adminApi.get<{ items: PersonSummary[] }>(`/api/admin/people?q=${encodeURIComponent(debounced)}`),
    enabled: debounced.length >= 2,
  });

  const items = (data?.items ?? []).filter((p) => p.id !== excludeId);

  return (
    <div className="space-y-2">
      <Input
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder={placeholder ?? 'Търсене на човек…'}
        autoFocus={autoFocus}
        aria-label="Търсене на човек"
      />
      {debounced.length >= 2 && (
        <div className="max-h-56 overflow-y-auto rounded-md border">
          {isFetching && <p className="p-2 text-sm text-muted-foreground">Търсене…</p>}
          {!isFetching && items.length === 0 && (
            <p className="p-2 text-sm text-muted-foreground">Няма съвпадения.</p>
          )}
          <ul>
            {items.map((p) => (
              <li key={p.id}>
                <button
                  type="button"
                  onClick={() => onSelect(p)}
                  className="flex w-full items-center justify-between gap-2 px-3 py-2 text-left text-sm hover:bg-muted"
                >
                  <span className="font-medium">{p.label || 'Без име'}</span>
                  <Badge variant="outline">{toLabel(LIVING_STATUS_LABELS, p.livingStatus)}</Badge>
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
