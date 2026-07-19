import type { Metadata } from 'next';

export const metadata: Metadata = { title: 'Въпросник' };

export default function QuestionnairePage() {
  return (
    <div className="mx-auto max-w-3xl px-4 py-16">
      <h1 className="text-2xl font-semibold tracking-tight">Въпросник</h1>
      <p className="mt-4 text-muted-foreground">
        Формата за попълване се подготвя. Скоро тук ще можете да споделите информация за рода —
        стъпка по стъпка, без регистрация.
      </p>
    </div>
  );
}
