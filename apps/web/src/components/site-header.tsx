import Link from 'next/link';

const NAV = [
  { href: '/', label: 'Начало' },
  { href: '/questionnaire', label: 'Въпросник' },
  { href: '/tree', label: 'Родословно дърво' },
];

export function SiteHeader() {
  return (
    <header className="border-b">
      <div className="mx-auto flex max-w-5xl items-center justify-between gap-4 px-4 py-4">
        <Link href="/" className="font-semibold tracking-tight">
          Родословно дърво <span className="text-muted-foreground">Митовски</span>
        </Link>
        <nav aria-label="Основна навигация">
          <ul className="flex items-center gap-4 text-sm">
            {NAV.map((item) => (
              <li key={item.href}>
                <Link href={item.href} className="text-muted-foreground hover:text-foreground">
                  {item.label}
                </Link>
              </li>
            ))}
          </ul>
        </nav>
      </div>
    </header>
  );
}
