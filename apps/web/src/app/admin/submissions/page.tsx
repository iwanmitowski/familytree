'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { adminApi } from '@/features/admin/client';
import { StatusBadge } from '@/features/admin/StatusBadge';
import type { SubmissionListItem, SubmissionStatus } from '@/features/admin/types';
import { Badge } from '@/components/ui/badge';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';

const TABS: { value: SubmissionStatus; label: string }[] = [
  { value: 'pending', label: 'Чакащи' },
  { value: 'in_review', label: 'В преглед' },
  { value: 'processed', label: 'Обработени' },
  { value: 'rejected', label: 'Отхвърлени' },
  { value: 'spam', label: 'Спам' },
];

export default function SubmissionsPage() {
  const [status, setStatus] = useState<SubmissionStatus>('pending');

  const { data, isLoading, error } = useQuery({
    queryKey: ['admin', 'submissions', status],
    queryFn: () => adminApi.get<{ items: SubmissionListItem[] }>(`/api/admin/submissions?status=${status}`),
  });

  return (
    <div>
      <h1 className="mb-6 text-2xl font-semibold tracking-tight">Заявки</h1>

      <div className="mb-4 flex flex-wrap gap-2">
        {TABS.map((t) => (
          <button
            key={t.value}
            onClick={() => setStatus(t.value)}
            className={`rounded-md px-3 py-1.5 text-sm ${
              status === t.value ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {isLoading && <p className="text-sm text-muted-foreground">Зареждане…</p>}
      {error && <p className="text-sm text-destructive">Грешка при зареждане.</p>}

      {data && (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Дата</TableHead>
              <TableHead>Участник</TableHead>
              <TableHead>Кампания</TableHead>
              <TableHead>Хора</TableHead>
              <TableHead>Статус</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {data.items.length === 0 && (
              <TableRow>
                <TableCell colSpan={5} className="text-center text-muted-foreground">
                  Няма заявки в тази категория.
                </TableCell>
              </TableRow>
            )}
            {data.items.map((s) => (
              <TableRow key={s.id}>
                <TableCell className="whitespace-nowrap text-sm text-muted-foreground">
                  {s.submittedAt ? new Date(s.submittedAt).toLocaleDateString('bg-BG') : '—'}
                </TableCell>
                <TableCell>
                  <Link href={`/admin/submissions/${s.id}`} className="font-medium hover:underline">
                    {s.participantName ?? 'Без име'}
                  </Link>
                  {s.hasMaterials && (
                    <Badge variant="outline" className="ml-2">
                      Материали
                    </Badge>
                  )}
                </TableCell>
                <TableCell className="text-sm text-muted-foreground">{s.campaign ?? '—'}</TableCell>
                <TableCell>{s.peopleCount}</TableCell>
                <TableCell>
                  <StatusBadge status={s.status} />
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </div>
  );
}
