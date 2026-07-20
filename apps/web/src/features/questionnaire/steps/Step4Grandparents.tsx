'use client';

import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import type { z } from 'zod';
import { step4Schema } from '../schema';
import { useQuestionnaire } from '../store';
import { StepNav } from '../components/StepNav';
import { PersonBlockFields } from '../components/PersonBlockFields';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

type FormValues = z.input<typeof step4Schema>;

const OPTS = {
  showOccupation: true,
  showFamilyStories: true,
  showInfoSource: true,
} as const;

const BLOCKS = [
  { key: 'paternalGrandfather', title: 'Дядо по бащина линия' },
  { key: 'paternalGrandmother', title: 'Баба по бащина линия' },
  { key: 'maternalGrandfather', title: 'Дядо по майчина линия' },
  { key: 'maternalGrandmother', title: 'Баба по майчина линия' },
] as const;

export function Step4Grandparents() {
  const { values, commitStep, back } = useQuestionnaire();
  const {
    register,
    handleSubmit,
    control,
    setValue,
    formState: { errors },
  } = useForm<FormValues>({
    resolver: zodResolver(step4Schema),
    defaultValues: values as FormValues,
  });

  return (
    <form
      onSubmit={handleSubmit((data) => commitStep(data as Record<string, unknown>))}
      noValidate
    >
      <p className="mb-4 text-sm text-muted-foreground">
        Дори само имената на бабите и дядовците помагат много. Може да пропуснете тази стъпка.
      </p>
      <div className="grid gap-6">
        {BLOCKS.map((b) => (
          <Card key={b.key}>
            <CardHeader>
              <CardTitle className="text-base">{b.title}</CardTitle>
            </CardHeader>
            <CardContent>
              <PersonBlockFields
                register={register}
                errors={errors}
                control={control}
                setValue={setValue}
                prefix={b.key}
                idPrefix={b.key}
                options={OPTS}
              />
            </CardContent>
          </Card>
        ))}
      </div>
      <StepNav
        canBack
        onBack={back}
        onSkip={() =>
          commitStep({
            paternalGrandfather: undefined,
            paternalGrandmother: undefined,
            maternalGrandfather: undefined,
            maternalGrandmother: undefined,
          })
        }
      />
    </form>
  );
}
