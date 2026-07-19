import type { Metadata } from 'next';
import { Inter, JetBrains_Mono } from 'next/font/google';
import './globals.css';
import { SiteHeader } from '@/components/site-header';
import { SiteFooter } from '@/components/site-footer';
import { Providers } from '@/components/providers';
import { Toaster } from '@/components/ui/sonner';

// Inter and JetBrains Mono both ship full Cyrillic — self-hosted via next/font.
const sans = Inter({
  variable: '--font-sans',
  subsets: ['latin', 'cyrillic'],
  display: 'swap',
});

const mono = JetBrains_Mono({
  variable: '--font-mono',
  subsets: ['latin', 'cyrillic'],
  display: 'swap',
});

export const metadata: Metadata = {
  title: {
    default: 'Родословно дърво Митовски',
    template: '%s · Родословно дърво Митовски',
  },
  description:
    'Семеен и исторически проект за събиране и визуализиране на информация за рода Митовски.',
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="bg" className={`${sans.variable} ${mono.variable} h-full antialiased`}>
      <body className="min-h-full flex flex-col font-sans">
        <Providers>
          <SiteHeader />
          <main className="flex-1">{children}</main>
          <SiteFooter />
          <Toaster />
        </Providers>
      </body>
    </html>
  );
}
