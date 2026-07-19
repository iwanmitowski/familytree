import Link from 'next/link';
import { Button } from '@/components/ui/button';

export default function NotFound() {
  return (
    <div className="mx-auto flex max-w-5xl flex-col items-start gap-4 px-4 py-24">
      <h1 className="text-2xl font-semibold tracking-tight">Страницата не е намерена</h1>
      <p className="text-muted-foreground">
        Възможно е връзката да е остаряла или страницата да е преместена.
      </p>
      <Button asChild>
        <Link href="/">Към началото</Link>
      </Button>
    </div>
  );
}
