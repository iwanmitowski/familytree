import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';

export default function HomePage() {
  return (
    <div className="mx-auto max-w-5xl px-4 py-16">
      <section className="max-w-2xl">
        <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">
          Родословно дърво на рода Митовски
        </h1>
        <p className="mt-4 text-muted-foreground">
          Това е семеен и исторически проект, който събира и подрежда спомени, имена и връзки
          между хората от рода Митовски и техните роднини. Всеки може да сподели каквото знае —
          без регистрация. Информацията се преглежда внимателно, преди да влезе в общото дърво.
        </p>
        <div className="mt-8 flex flex-wrap gap-3">
          <Button asChild>
            <Link href="/questionnaire">Попълни въпросника</Link>
          </Button>
          <Button asChild variant="outline">
            <Link href="/tree">Разгледай дървото</Link>
          </Button>
        </div>
      </section>

      <section className="mt-16 grid gap-4 sm:grid-cols-3">
        <Card>
          <CardHeader>
            <CardTitle>Споделете спомен</CardTitle>
            <CardDescription>
              Разкажете за себе си, родителите, бабите и дядовците — колкото знаете.
            </CardDescription>
          </CardHeader>
          <CardContent className="text-sm text-muted-foreground">
            Дори само име или населено място помагат да свържем клоновете на рода.
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Внимателна проверка</CardTitle>
            <CardDescription>
              Всяко изпращане се преглежда, преди да стане част от потвърденото дърво.
            </CardDescription>
          </CardHeader>
          <CardContent className="text-sm text-muted-foreground">
            Не създаваме дублирани хора и пазим оригиналната информация.
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Уважение към личните данни</CardTitle>
            <CardDescription>
              Данните за живите хора са лични по подразбиране и не се показват публично.
            </CardDescription>
          </CardHeader>
          <CardContent className="text-sm text-muted-foreground">
            Вие решавате какво може да бъде видяно от други членове на рода.
          </CardContent>
        </Card>
      </section>
    </div>
  );
}
