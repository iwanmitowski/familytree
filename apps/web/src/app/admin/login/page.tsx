import type { Metadata } from 'next';
import { signIn } from '@/server/auth';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';

export const metadata: Metadata = { title: 'Администраторски вход' };

export default async function AdminLoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;

  return (
    <div className="mx-auto flex max-w-md flex-col px-4 py-24">
      <Card>
        <CardHeader>
          <CardTitle>Администраторски вход</CardTitle>
          <CardDescription>
            Достъпът е ограничен до одобрени администратори на проекта.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4">
          {error && (
            <p className="text-sm text-destructive" role="alert">
              Нямате достъп с този акаунт или входът не бе успешен.
            </p>
          )}
          <form
            action={async () => {
              'use server';
              await signIn('google', { redirectTo: '/admin' });
            }}
          >
            <Button type="submit" className="w-full">
              Вход с Google
            </Button>
          </form>

          {/* Dev/E2E only — hard-guarded off in production (see e2e-credentials.ts). */}
          {process.env.E2E_TEST_MODE === '1' && (
            <form
              action={async (formData: FormData) => {
                'use server';
                await signIn('credentials', {
                  email: formData.get('email'),
                  password: formData.get('password'),
                  redirectTo: '/admin',
                });
              }}
              className="grid gap-2 border-t pt-4"
            >
              <p className="text-xs text-muted-foreground">Тестов вход (само за разработка)</p>
              <Input name="email" type="email" placeholder="Имейл" required />
              <Input name="password" type="password" placeholder="Парола" required />
              <Button type="submit" variant="outline" className="w-full">
                Тестов вход
              </Button>
            </form>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
