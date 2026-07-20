'use client';

import { useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { adminApi } from '@/features/admin/client';
import type { FileMeta } from './types';
import { Button } from '@/components/ui/button';

async function uploadFile(personId: string, file: File): Promise<void> {
  const form = new FormData();
  form.append('file', file);
  form.append('personId', personId);
  const res = await fetch('/api/admin/files', { method: 'POST', headers: { 'X-Admin-Request': '1' }, body: form });
  if (!res.ok) {
    const body = (await res.json().catch(() => null)) as { error?: { message?: string } } | null;
    throw new Error(body?.error?.message ?? 'Качването не бе успешно');
  }
}

function formatSize(bytes: number): string {
  return bytes < 1024 * 1024 ? `${Math.round(bytes / 1024)} KB` : `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

export function FilesTab({ personId }: { personId: string }) {
  const queryClient = useQueryClient();
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragOver, setDragOver] = useState(false);
  const invalidate = () => queryClient.invalidateQueries({ queryKey: ['admin', 'files', personId] });

  const { data, isLoading, error } = useQuery({
    queryKey: ['admin', 'files', personId],
    queryFn: () => adminApi.get<{ items: FileMeta[] }>(`/api/admin/files?personId=${personId}`),
  });

  const upload = useMutation({
    mutationFn: (file: File) => uploadFile(personId, file),
    onSuccess: () => { toast.success('Файлът е качен'); void invalidate(); },
    onError: (err: Error) => toast.error(err.message),
  });

  const remove = useMutation({
    mutationFn: (id: string) => adminApi.del(`/api/admin/files/${id}`),
    onSuccess: () => { toast.success('Файлът е изтрит'); void invalidate(); },
    onError: (err: Error) => toast.error(err.message),
  });

  const onFiles = (files: FileList | null) => {
    if (files) for (const f of Array.from(files)) upload.mutate(f);
  };

  const items = data?.items ?? [];

  return (
    <div className="space-y-4">
      <div
        onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(e) => { e.preventDefault(); setDragOver(false); onFiles(e.dataTransfer.files); }}
        className={`flex flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed p-6 text-center text-sm ${
          dragOver ? 'border-primary bg-primary/5' : 'border-muted-foreground/30'
        }`}
      >
        <p className="text-muted-foreground">Плъзнете снимка или документ тук (JPEG, PNG, WEBP, PDF · до 10MB)</p>
        <Button variant="outline" size="sm" disabled={upload.isPending} onClick={() => inputRef.current?.click()}>
          {upload.isPending ? 'Качване…' : 'Избери файл'}
        </Button>
        <input
          ref={inputRef}
          type="file"
          accept="image/jpeg,image/png,image/webp,application/pdf"
          multiple
          className="hidden"
          onChange={(e) => { onFiles(e.target.files); e.target.value = ''; }}
        />
      </div>

      {isLoading && <p className="text-sm text-muted-foreground">Зареждане…</p>}
      {error && <p className="text-sm text-destructive">Грешка при зареждане.</p>}
      {data && items.length === 0 && <p className="text-sm text-muted-foreground">Няма прикачени файлове.</p>}

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        {items.map((f) => (
          <div key={f.id} className="overflow-hidden rounded-lg border">
            <a href={`/api/admin/files/${f.id}`} target="_blank" rel="noopener noreferrer" className="block bg-muted/40">
              {f.contentType.startsWith('image/') ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={`/api/admin/files/${f.id}`} alt={f.originalFilename} className="h-32 w-full object-cover" />
              ) : (
                <div className="flex h-32 w-full items-center justify-center text-4xl">📄</div>
              )}
            </a>
            <div className="space-y-1 p-2">
              <p className="truncate text-xs font-medium" title={f.originalFilename}>{f.originalFilename}</p>
              <p className="text-xs text-muted-foreground">{formatSize(f.sizeBytes)}</p>
              <div className="flex justify-between">
                <a href={`/api/admin/files/${f.id}`} download={f.originalFilename} className="text-xs text-primary hover:underline">
                  Изтегли
                </a>
                <button
                  onClick={() => { if (confirm('Да се изтрие ли файлът?')) remove.mutate(f.id); }}
                  className="text-xs text-destructive hover:underline"
                >
                  Изтрий
                </button>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
