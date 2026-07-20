'use client';

import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import type { z } from 'zod';
import { step6Schema } from '../schema';
import { MATERIALS_ANSWER, MATERIALS_ANSWER_LABELS } from '../labels';
import { useQuestionnaire } from '../store';
import { StepNav } from '../components/StepNav';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';

type FormValues = z.input<typeof step6Schema>;

export function Step6Origin() {
  const { values, commitStep, back } = useQuestionnaire();
  const { register, handleSubmit } = useForm<FormValues>({
    resolver: zodResolver(step6Schema),
    defaultValues: { hasMaterials: 'unsure', ...(values as Partial<FormValues>) },
  });

  return (
    <form
      onSubmit={handleSubmit((data) => commitStep(data as Record<string, unknown>))}
      noValidate
    >
      <p className="mb-4 text-sm text-muted-foreground">
        Разкажете за произхода на рода. Може да пропуснете тази стъпка.
      </p>
      <div className="grid gap-4">
        <div>
          <Label htmlFor="oldestKnownSettlement">Най-старото известно населено място</Label>
          <Input id="oldestKnownSettlement" {...register('oldestKnownSettlement')} />
        </div>
        <div>
          <Label htmlFor="surnameOrigin">Произход на фамилията</Label>
          <Textarea id="surnameOrigin" rows={2} {...register('surnameOrigin')} />
        </div>
        <div>
          <Label htmlFor="spellingVariants">Различни изписвания на фамилията</Label>
          <Input id="spellingVariants" {...register('spellingVariants')} />
        </div>
        <div>
          <Label htmlFor="familyNicknames">Семейни прякори</Label>
          <Input id="familyNicknames" {...register('familyNicknames')} />
        </div>
        <div>
          <Label htmlFor="migrations">Миграции</Label>
          <Textarea id="migrations" rows={2} {...register('migrations')} />
        </div>
        <div>
          <Label htmlFor="relativesAbroad">Роднини извън България</Label>
          <Textarea id="relativesAbroad" rows={2} {...register('relativesAbroad')} />
        </div>
        <div>
          <Label htmlFor="familyStories">Семейни истории</Label>
          <Textarea id="familyStories" rows={3} {...register('familyStories')} />
        </div>
        <div>
          <Label htmlFor="oldestLivingRelative">Най-възрастният жив роднина</Label>
          <Input id="oldestLivingRelative" {...register('oldestLivingRelative')} />
        </div>

        <fieldset className="grid gap-2 rounded-md border p-4">
          <legend className="px-1 text-sm font-medium">
            Пазите ли стари снимки, документи или писма, свързани с рода?
          </legend>
          <p className="text-xs text-muted-foreground">
            Не е нужно да ги качвате сега — просто ни помага да знаем кой какво пази, за да ги
            съберем по-късно.
          </p>
          <div className="flex flex-wrap gap-4">
            {MATERIALS_ANSWER.map((a) => (
              <label key={a} className="flex items-center gap-2 text-sm">
                <input type="radio" value={a} {...register('hasMaterials')} />
                {MATERIALS_ANSWER_LABELS[a]}
              </label>
            ))}
          </div>
          <div>
            <Label htmlFor="materialsDescription">Какви материали?</Label>
            <Textarea id="materialsDescription" rows={2} {...register('materialsDescription')} />
          </div>
        </fieldset>
      </div>

      <StepNav
        canBack
        onBack={back}
        onSkip={() => commitStep({ hasMaterials: 'unsure', materialsDescription: undefined })}
      />
    </form>
  );
}
