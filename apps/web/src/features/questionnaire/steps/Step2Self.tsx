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

/** Splits "Иван Петров Митовски" into first / middle / surname parts. */
function splitName(full: string): { firstName?: string; middleName?: string; surname?: string } {
  const parts = full.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return {};
  if (parts.length === 1) return { firstName: parts[0] };
  if (parts.length === 2) return { firstName: parts[0], surname: parts[1] };
  return { firstName: parts[0], middleName: parts.slice(1, -1).join(' '), surname: parts[parts.length - 1] };
}

export function Step2Self() {
  const { values, commitStep, back, autosave } = useQuestionnaire();
  const v = values as { self?: { firstName?: string }; fillingForOther?: boolean; participantName?: string };
  const forOther = Boolean(v.fillingForOther);

  // Filling for yourself → your names are already known from step 1; prefill
  // them (still editable) instead of asking again. You are also alive, so no
  // living-status question and no death fields.
  const prefilled = !forOther && !v.self?.firstName ? splitName(v.participantName ?? '') : {};

  const {
    register,
    handleSubmit,
    watch,
    control,
    setValue,
    formState: { errors },
  } = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      self: {
        livingStatus: 'living',
        ...prefilled,
        ...((values as { self?: object }).self ?? {}),
      },
    },
  });

  return (
    <form
      onChange={() => autosave(watch() as Record<string, unknown>)}
      onSubmit={handleSubmit((data) => commitStep(data as Record<string, unknown>))}
      noValidate
    >
      <p className="mb-4 text-sm text-muted-foreground">
        {forOther
          ? 'Разкажете за човека, от чието име попълвате. Попълнете каквото знаете — всяко късче помага.'
          : 'Разкажете малко повече за себе си. Не е нужна точна дата на раждане — годината е достатъчна.'}
      </p>
      {!forOther && prefilled.firstName && (
        <p className="mb-4 rounded-md border border-primary/30 bg-primary/5 p-3 text-sm">
          Попълнихме имената Ви от предишната стъпка — прегледайте ги и ги допълнете при нужда.
        </p>
      )}
      <fieldset>
        <legend className="sr-only">
          {forOther ? 'Информация за лицето' : 'Информация за Вас'}
        </legend>
        <PersonBlockFields
          register={register}
          errors={errors}
          control={control}
          setValue={setValue}
          prefix="self"
          idPrefix="self"
          options={{
            hideLivingStatus: !forOther,
            showOccupation: true,
            showPreviousSurnames: true,
            showInfoSource: forOther,
          }}
        />
      </fieldset>
      <StepNav canBack onBack={back} />
    </form>
  );
}
