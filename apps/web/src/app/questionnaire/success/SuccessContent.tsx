'use client';

import { useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { Button } from '@/components/ui/button';

/** Reference code + snowball share prompt (idea.md §14 addition). */
export function SuccessContent() {
  const ref = useSearchParams().get('ref');
  const [copied, setCopied] = useState(false);

  const shareUrl =
    typeof window !== 'undefined' ? `${window.location.origin}/questionnaire` : '/questionnaire';
  const shareText = 'Помогнете да съберем историята на рода Митовски — попълнете този въпросник:';

  async function share() {
    if (typeof navigator !== 'undefined' && 'share' in navigator) {
      try {
        await navigator.share({ title: 'Родословно дърво Митовски', text: shareText, url: shareUrl });
        return;
      } catch {
        // fall through to copy
      }
    }
    try {
      await navigator.clipboard.writeText(shareUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // ignore
    }
  }

  return (
    <div className="mt-6 grid gap-6">
      {ref && (
        <p className="text-sm">
          Референтен код: <span className="font-mono font-medium">{ref}</span>
        </p>
      )}

      <div className="rounded-md border bg-muted/40 p-4">
        <p className="text-sm font-medium">Изпратете въпросника на роднина, който знае повече</p>
        <p className="mt-1 text-sm text-muted-foreground">
          Всяко споделяне помага да свържем още клонове на рода.
        </p>
        <div className="mt-3">
          <Button type="button" size="sm" onClick={() => void share()}>
            Сподели въпросника
          </Button>
          {copied && <span className="ml-3 text-sm text-muted-foreground">Копиран линк!</span>}
        </div>
      </div>
    </div>
  );
}
