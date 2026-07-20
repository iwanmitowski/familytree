import type { Metadata } from 'next';
import Link from 'next/link';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

export const metadata: Metadata = { title: 'Администрация' };

const SECTIONS = [
  { href: '/admin/submissions', title: 'Заявки', desc: 'Преглед на изпратените въпросници.' },
  { href: '/admin/invites', title: 'Покани', desc: 'Създаване и управление на покани.' },
  { href: '/admin/people', title: 'Хора', desc: 'Потвърдените хора в рода.' },
  { href: '/admin/tree', title: 'Дърво', desc: 'Родословното дърво.' },
];

export default function AdminHomePage() {
  return (
    <div>
      <h1 className="mb-6 text-2xl font-semibold tracking-tight">Администрация</h1>
      <div className="grid gap-4 sm:grid-cols-2">
        {SECTIONS.map((s) => (
          <Link key={s.href} href={s.href}>
            <Card className="transition-colors hover:bg-muted/40">
              <CardHeader>
                <CardTitle className="text-base">{s.title}</CardTitle>
              </CardHeader>
              <CardContent className="text-sm text-muted-foreground">{s.desc}</CardContent>
            </Card>
          </Link>
        ))}
      </div>
    </div>
  );
}
