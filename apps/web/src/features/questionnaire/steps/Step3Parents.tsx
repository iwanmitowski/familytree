'use client';

import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { step3Schema } from '../schema';
import { useQuestionnaire } from '../store';
import { StepNav } from '../components/StepNav';
import { PersonBlockFields } from '../components/PersonBlockFields';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import type { z } from 'zod';

type FormValues = z.input<typeof step3Schema>;

const PERSON_OPTS = {
  showOccupation: true,
  showRelationshipType: true,
  showInfoSource: true,
} as const;

export function Step3Parents() {
  const { values, commitStep, back } = useQuestionnaire();
  const {
    register,
    handleSubmit,
    control,
    setValue,
    formState: { errors },
  } = useForm<FormValues>({
    resolver: zodResolver(step3Schema),
    defaultValues: values as FormValues,
  });

  return (
    <form
      onSubmit={handleSubmit((data) => commitStep(data as Record<string, unknown>))}
      noValidate
    >
      <p className="mb-4 text-sm text-muted-foreground">
        Опишете родителите си, доколкото знаете. Може да пропуснете тази стъпка.
      </p>
      <div className="grid gap-6">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Баща</CardTitle>
          </CardHeader>
          <CardContent>
            <PersonBlockFields
              register={register}
              errors={errors}
              control={control}
              setValue={setValue}
              prefix="father"
              idPrefix="father"
              options={PERSON_OPTS}
            />
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Майка</CardTitle>
          </CardHeader>
          <CardContent>
            <PersonBlockFields
              register={register}
              errors={errors}
              control={control}
              setValue={setValue}
              prefix="mother"
              idPrefix="mother"
              options={PERSON_OPTS}
            />
          </CardContent>
        </Card>
      </div>
      <StepNav
        canBack
        onBack={back}
        onSkip={() => commitStep({ father: undefined, mother: undefined })}
      />
    </form>
  );
}
