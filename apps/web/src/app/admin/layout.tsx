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
    // Mobile: nav stacks on top as a horizontal scrollable row; desktop: sidebar.
    <div className="mx-auto flex max-w-6xl flex-col gap-6 px-4 py-6 md:flex-row md:gap-8 md:py-8">
      <aside className="w-full shrink-0 md:w-48">
        <nav
          className="flex gap-1 overflow-x-auto pb-1 md:grid md:overflow-visible md:pb-0"
          aria-label="Администрация"
        >
          {NAV.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className="whitespace-nowrap rounded-md px-3 py-2 text-sm text-muted-foreground hover:bg-muted hover:text-foreground"
            >
              {item.label}
            </Link>
          ))}
        </nav>
        <div className="mt-3 flex items-center justify-between gap-2 border-t pt-3 md:mt-6 md:block md:pt-4">
          <p className="truncate text-xs text-muted-foreground">{session.user.email}</p>
          <form
            action={async () => {
              'use server';
              await signOut({ redirectTo: '/admin/login' });
            }}
          >
            <Button type="submit" variant="ghost" size="sm" className="px-0 md:mt-2">
              Изход
            </Button>
          </form>
        </div>
      </aside>
      <div className="min-w-0 flex-1">{children}</div>
    </div>
  );
}
