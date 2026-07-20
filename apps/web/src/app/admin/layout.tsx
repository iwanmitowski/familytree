import type { ReactNode } from 'react';
import Link from 'next/link';
import { auth, signOut } from '@/server/auth';
import { Button } from '@/components/ui/button';

const NAV = [
  { href: '/admin/submissions', label: 'Заявки' },
  { href: '/admin/invites', label: 'Покани' },
  { href: '/admin/people', label: 'Хора' },
  { href: '/admin/tree', label: 'Дърво' },
];

export default async function AdminLayout({ children }: { children: ReactNode }) {
  const session = await auth();

  // Unauthenticated (e.g. the login page) renders without the admin shell.
  if (!session?.user || session.user.role !== 'admin') {
    return <>{children}</>;
  }

  return (
    <div className="mx-auto flex max-w-6xl gap-8 px-4 py-8">
      <aside className="w-48 shrink-0">
        <nav className="grid gap-1" aria-label="Администрация">
          {NAV.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className="rounded-md px-3 py-2 text-sm text-muted-foreground hover:bg-muted hover:text-foreground"
            >
              {item.label}
            </Link>
          ))}
        </nav>
        <div className="mt-6 border-t pt-4">
          <p className="truncate text-xs text-muted-foreground">{session.user.email}</p>
          <form
            action={async () => {
              'use server';
              await signOut({ redirectTo: '/admin/login' });
            }}
          >
            <Button type="submit" variant="ghost" size="sm" className="mt-2 px-0">
              Изход
            </Button>
          </form>
        </div>
      </aside>
      <div className="min-w-0 flex-1">{children}</div>
    </div>
  );
}
