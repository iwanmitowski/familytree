'use client';

import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { step1Schema } from '../schema';
import { CONTACT_METHOD, CONTACT_METHOD_LABELS } from '../labels';
import { useQuestionnaire } from '../store';
import { StepNav } from '../components/StepNav';
import { Honeypot } from '../components/Honeypot';
import { FieldError } from '../components/PersonBlockFields';

// Extend with the honeypot so it travels in this step's form (not in the
// public step1 schema — validated separately at final submit).
const formSchema = step1Schema.extend({ website: z.string().max(0).optional().or(z.literal('')) });
type FormValues = z.input<typeof formSchema>;

export function Step1Participant() {
  const { values, commitStep, autosave } = useQuestionnaire();
  const {
    register,
    handleSubmit,
    watch,
    formState: { errors },
  } = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      participantName: '',
      fillingForOther: false,
      connectionToFamily: '',
      preferredContact: 'none',
      website: '',
      ...(values as Partial<FormValues>),
    },
  });

  return (
    <form
      onChange={() => autosave(watch() as Record<string, unknown>)}
      onSubmit={handleSubmit((data) => commitStep(data as Record<string, unknown>))}
      noValidate
    >
      <Honeypot registration={register('website')} />

      <div className="grid gap-4">
        <div>
          <Label htmlFor="participantName">Вашите имена</Label>
          <Input id="participantName" {...register('participantName')} />
          <FieldError message={errors.participantName?.message} />
        </div>

        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" {...register('fillingForOther')} />
          Попълвам от името на друг роднина
        </label>

        <div>
          <Label htmlFor="connectionToFamily">Каква е връзката Ви с фамилията Митовски?</Label>
          <Input id="connectionToFamily" {...register('connectionToFamily')} />
          <FieldError message={errors.connectionToFamily?.message} />
        </div>

        <div>
          <Label htmlFor="branchOrigin">
            От кой град, село или регион произхожда Вашият клон?
          </Label>
          <Input id="branchOrigin" {...register('branchOrigin')} />
          <FieldError message={errors.branchOrigin?.message} />
        </div>

        <div>
          <Label htmlFor="email">Имейл за контакт (незадължително)</Label>
          <Input id="email" type="email" inputMode="email" {...register('email')} />
          <FieldError message={errors.email?.message} />
        </div>

        <div>
          <Label htmlFor="preferredContact">Предпочитан начин за контакт</Label>
          <select
            id="preferredContact"
            className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-base shadow-xs sm:text-sm"
            {...register('preferredContact')}
          >
            {CONTACT_METHOD.map((m) => (
              <option key={m} value={m}>
                {CONTACT_METHOD_LABELS[m]}
              </option>
            ))}
          </select>
        </div>

        <label className="flex items-start gap-2 text-sm">
          <input type="checkbox" className="mt-1" {...register('consentDataProcessing')} />
          <span>
            Съгласен/съгласна съм изпратената информация да бъде обработена за целите на семейния
            проект.
          </span>
        </label>
        <FieldError message={errors.consentDataProcessing?.message} />
      </div>

      <StepNav canBack={false} onBack={() => {}} />
    </form>
  );
}
