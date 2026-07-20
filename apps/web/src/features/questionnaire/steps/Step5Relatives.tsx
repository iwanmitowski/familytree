'use client';

import {
  useForm,
  useFieldArray,
  type Control,
  type FieldErrors,
  type UseFormRegister,
} from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import type { z } from 'zod';
import { personBlockSchema, step5Schema } from '../schema';
import { useQuestionnaire } from '../store';
import { StepNav } from '../components/StepNav';
import { PersonBlockFields } from '../components/PersonBlockFields';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';

type FormValues = z.input<typeof step5Schema>;

const CAP = 10;
const OPTS = { showDeath: true, showInfoSource: true } as const;

type ArrayName = 'siblings' | 'children' | 'partners' | 'unclesAunts' | 'otherRelatives';

const SECTIONS: { name: ArrayName; title: string; singular: string }[] = [
  { name: 'siblings', title: 'Братя и сестри', singular: 'брат/сестра' },
  { name: 'children', title: 'Деца', singular: 'дете' },
  { name: 'partners', title: 'Партньори', singular: 'партньор' },
  { name: 'unclesAunts', title: 'Чичовци и лели', singular: 'чичо/леля' },
  { name: 'otherRelatives', title: 'Други роднини', singular: 'роднина' },
];

function RepeatableSection({
  name,
  title,
  singular,
  control,
  register,
  errors,
}: {
  name: ArrayName;
  title: string;
  singular: string;
  control: Control<FormValues>;
  register: UseFormRegister<FormValues>;
  errors: FieldErrors<FormValues>;
}) {
  const { fields, append, remove } = useFieldArray({ control, name });
  const atCap = fields.length >= CAP;

  return (
    <section className="grid gap-3">
      <h2 className="text-lg font-medium">{title}</h2>
      {fields.map((field, index) => (
        <Card key={field.id}>
          <CardContent className="pt-6">
            <PersonBlockFields
              register={register}
              errors={errors}
              prefix={`${name}.${index}`}
              idPrefix={`${name}-${index}`}
              options={OPTS}
            />
            <div className="mt-3">
              <Button type="button" variant="ghost" size="sm" onClick={() => remove(index)}>
                Премахни
              </Button>
            </div>
          </CardContent>
        </Card>
      ))}
      <div>
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={atCap}
          onClick={() => append({ livingStatus: 'unknown' } as z.input<typeof personBlockSchema>)}
        >
          Добави {singular}
        </Button>
        {atCap && (
          <p className="mt-1 text-xs text-muted-foreground">Достигнахте максимума от {CAP} записа.</p>
        )}
      </div>
    </section>
  );
}

export function Step5Relatives() {
  const { values, commitStep, back } = useQuestionnaire();
  const form = useForm<FormValues>({
    resolver: zodResolver(step5Schema),
    defaultValues: {
      siblings: [],
      children: [],
      partners: [],
      unclesAunts: [],
      otherRelatives: [],
      ...(values as Partial<FormValues>),
    },
  });
  const {
    register,
    control,
    handleSubmit,
    formState: { errors },
  } = form;

  return (
    <form
      onSubmit={handleSubmit((data) => commitStep(data as Record<string, unknown>))}
      noValidate
    >
      <p className="mb-4 text-sm text-muted-foreground">
        Добавете толкова роднини, колкото желаете. Може да пропуснете тази стъпка.
      </p>
      <div className="grid gap-8">
        {SECTIONS.map((s) => (
          <RepeatableSection
            key={s.name}
            {...s}
            control={control}
            register={register}
            errors={errors}
          />
        ))}

        <section className="grid gap-3">
          <h2 className="text-lg font-medium">Човек, който може да даде повече информация</h2>
          <Card>
            <CardContent className="pt-6">
              <PersonBlockFields
                register={register}
                errors={errors}
                prefix="contactPerson"
                idPrefix="contactPerson"
                options={{ showInfoSource: true }}
              />
            </CardContent>
          </Card>
        </section>
      </div>

      <StepNav
        canBack
        onBack={back}
        onSkip={() =>
          commitStep({
            siblings: [],
            children: [],
            partners: [],
            unclesAunts: [],
            otherRelatives: [],
            contactPerson: undefined,
          })
        }
      />
    </form>
  );
}
