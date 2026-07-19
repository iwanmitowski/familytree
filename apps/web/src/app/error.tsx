'use client';

import { useEffect } from 'react';
import { Button } from '@/components/ui/button';

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // Client-side error boundary; server logs carry the detail.
    console.error(error);
  }, [error]);

  return (
    <div className="mx-auto flex max-w-5xl flex-col items-start gap-4 px-4 py-24">
      <h1 className="text-2xl font-semibold tracking-tight">Възникна грешка</h1>
      <p className="text-muted-foreground">
        Нещо се обърка. Можете да опитате отново или да се върнете по-късно.
      </p>
      <Button onClick={reset}>Опитай отново</Button>
    </div>
  );
}
