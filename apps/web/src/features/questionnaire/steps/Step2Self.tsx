'use client';

import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { step2Schema } from '../schema';
import { useQuestionnaire } from '../store';
import { StepNav } from '../components/StepNav';
import { PersonBlockFields } from '../components/PersonBlockFields';

const formSchema = z.object({ self: step2Schema });
type FormValues = z.input<typeof formSchema>;

export function Step2Self() {
  const { values, commitStep, back, autosave } = useQuestionnaire();
  const {
    register,
    handleSubmit,
    watch,
    formState: { errors },
  } = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      self: { livingStatus: 'living', ...((values as { self?: object }).self ?? {}) },
    },
  });

  return (
    <form
      onChange={() => autosave(watch() as Record<string, unknown>)}
      onSubmit={handleSubmit((data) => commitStep(data as Record<string, unknown>))}
      noValidate
    >
      <p className="mb-4 text-sm text-muted-foreground">
        Разкажете за себе си. Не е нужна точна дата на раждане — годината е достатъчна.
      </p>
      <fieldset>
        <legend className="sr-only">Информация за Вас</legend>
        <PersonBlockFields
          register={register}
          errors={errors}
          prefix="self"
          idPrefix="self"
          options={{ showDeath: true, showPreviousSurnames: true }}
        />
      </fieldset>
      <StepNav canBack onBack={back} />
    </form>
  );
}
