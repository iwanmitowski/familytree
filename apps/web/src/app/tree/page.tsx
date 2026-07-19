import type { Metadata } from 'next';

export const metadata: Metadata = { title: 'Родословно дърво' };

export default function TreePage() {
  return (
    <div className="mx-auto max-w-3xl px-4 py-16">
      <h1 className="text-2xl font-semibold tracking-tight">Родословно дърво</h1>
      <p className="mt-4 text-muted-foreground">
        Интерактивната визуализация на дървото се подготвя. Данните за живите хора ще остават
        скрити в публичния изглед.
      </p>
    </div>
  );
}
