import type { Metadata } from 'next';
import { Suspense } from 'react';
import Link from 'next/link';
import { SuccessContent } from './SuccessContent';
import { Button } from '@/components/ui/button';

export const metadata: Metadata = { title: 'Благодарим Ви' };

export default function QuestionnaireSuccessPage() {
  return (
    <div className="mx-auto max-w-2xl px-4 py-16">
      <h1 className="text-2xl font-semibold tracking-tight">Благодарим Ви!</h1>
      <p className="mt-4 text-muted-foreground">
        Информацията Ви е получена и ще бъде прегледана внимателно, преди да стане част от
        родословното дърво.
      </p>
      <Suspense fallback={null}>
        <SuccessContent />
      </Suspense>
      <div className="mt-8">
        <Button asChild variant="outline">
          <Link href="/">Към началото</Link>
        </Button>
      </div>
    </div>
  );
}
