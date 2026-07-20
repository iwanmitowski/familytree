'use client';

import {
  useWatch,
  type Control,
  type FieldErrors,
  type FieldValues,
  type Path,
  type UseFormRegister,
  type UseFormSetValue,
} from 'react-hook-form';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { LIVING_STATUS, LIVING_STATUS_LABELS, PARENT_RELATIONSHIP, PARENT_RELATIONSHIP_LABELS } from '../labels';
import { YearField } from './YearField';

export interface PersonFieldOptions {
  /** Hide the living-status select (e.g. the participant filling for themselves). */
  hideLivingStatus?: boolean;
  showOccupation?: boolean;
  showRelationshipType?: boolean;
  showFamilyStories?: boolean;
  showInfoSource?: boolean;
  showPreviousSurnames?: boolean;
}

/** Reads a possibly-nested error message at `path` from RHF errors. */
function errorAt(errors: FieldErrors, path: string): string | undefined {
  const node = path.split('.').reduce<unknown>((acc, key) => {
    if (acc && typeof acc === 'object') return (acc as Record<string, unknown>)[key];
    return undefined;
  }, errors);
  if (node && typeof node === 'object' && 'message' in node) {
    const msg = (node as { message?: unknown }).message;
    return typeof msg === 'string' ? msg : undefined;
  }
  return undefined;
}

export function FieldError({ message }: { message?: string }) {
  if (!message) return null;
  return (
    <p className="mt-1 text-sm text-destructive" role="alert">
      {message}
    </p>
  );
}

/**
 * Reusable set of fields describing one person (idea.md §9). `prefix` is the
 * RHF path (e.g. "self", "father", "siblings.0"); options toggle the parts a
 * given step needs. Death fields appear ONLY when the person is marked as
 * deceased — a living person is never asked for a year of death.
 */
export function PersonBlockFields<T extends FieldValues>({
  register,
  errors,
  control,
  setValue,
  prefix,
  options = {},
  idPrefix,
}: {
  register: UseFormRegister<T>;
  errors: FieldErrors<T>;
  control: Control<T>;
  setValue: UseFormSetValue<T>;
  prefix: string;
  options?: PersonFieldOptions;
  idPrefix: string;
}) {
  const p = (name: string) => `${prefix}.${name}` as Path<T>;
  const id = (name: string) => `${idPrefix}-${name}`;

  const livingStatus = useWatch({ control, name: p('livingStatus') }) as string | undefined;
  const birthYear = useWatch({ control, name: p('birthYear') }) as number | undefined;
  const deathYear = useWatch({ control, name: p('deathYear') }) as number | undefined;
  const showDeath = !options.hideLivingStatus && livingStatus === 'deceased';

  return (
    <div className="grid gap-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <Label htmlFor={id('firstName')}>Собствено име</Label>
          <Input id={id('firstName')} {...register(p('firstName'))} />
          <FieldError message={errorAt(errors, p('firstName'))} />
        </div>
        <div>
          <Label htmlFor={id('middleName')}>Бащино име</Label>
          <Input id={id('middleName')} {...register(p('middleName'))} />
          <FieldError message={errorAt(errors, p('middleName'))} />
        </div>
        <div>
          <Label htmlFor={id('surname')}>Фамилия</Label>
          <Input id={id('surname')} {...register(p('surname'))} />
          <FieldError message={errorAt(errors, p('surname'))} />
        </div>
        <div>
          <Label htmlFor={id('birthSurname')}>Фамилия по рождение</Label>
          <Input id={id('birthSurname')} {...register(p('birthSurname'))} />
          <FieldError message={errorAt(errors, p('birthSurname'))} />
        </div>
        {options.showPreviousSurnames && (
          <div>
            <Label htmlFor={id('previousSurnames')}>Предишни фамилии</Label>
            <Input id={id('previousSurnames')} {...register(p('previousSurnames'))} />
            <FieldError message={errorAt(errors, p('previousSurnames'))} />
          </div>
        )}
        <div>
          <Label htmlFor={id('nickname')}>Прякор</Label>
          <Input id={id('nickname')} {...register(p('nickname'))} />
          <FieldError message={errorAt(errors, p('nickname'))} />
        </div>
      </div>

      {!options.hideLivingStatus && (
        <div className="sm:max-w-xs">
          <Label htmlFor={id('livingStatus')}>Жив/а ли е този човек?</Label>
          <select
            id={id('livingStatus')}
            className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-base shadow-xs sm:text-sm"
            {...register(p('livingStatus'))}
          >
            {LIVING_STATUS.map((s) => (
              <option key={s} value={s}>
                {LIVING_STATUS_LABELS[s]}
              </option>
            ))}
          </select>
        </div>
      )}

      <div className="grid gap-4 sm:grid-cols-2">
        <YearField
          name={p('birthYear')}
          id={id('birthYear')}
          label="Година на раждане"
          register={register}
          setValue={setValue}
          value={birthYear}
          error={errorAt(errors, p('birthYear'))}
        />
        {showDeath && (
          <YearField
            name={p('deathYear')}
            id={id('deathYear')}
            label="Година на смърт"
            register={register}
            setValue={setValue}
            value={deathYear}
            error={errorAt(errors, p('deathYear'))}
          />
        )}
        <div>
          <Label htmlFor={id('birthplace')}>Място на раждане</Label>
          <Input id={id('birthplace')} placeholder="град / село" {...register(p('birthplace'))} />
          <FieldError message={errorAt(errors, p('birthplace'))} />
        </div>
        {options.showOccupation && (
          <div>
            <Label htmlFor={id('occupation')}>Професия</Label>
            <Input id={id('occupation')} {...register(p('occupation'))} />
            <FieldError message={errorAt(errors, p('occupation'))} />
          </div>
        )}
        {options.showRelationshipType && (
          <div>
            <Label htmlFor={id('relationshipType')}>Вид връзка</Label>
            <select
              id={id('relationshipType')}
              className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-base shadow-xs sm:text-sm"
              {...register(p('relationshipType'))}
            >
              <option value="">—</option>
              {PARENT_RELATIONSHIP.map((r) => (
                <option key={r} value={r}>
                  {PARENT_RELATIONSHIP_LABELS[r]}
                </option>
              ))}
            </select>
          </div>
        )}
      </div>

      <div>
        <Label htmlFor={id('residences')}>Места, на които е живял/живяла</Label>
        <Textarea id={id('residences')} rows={2} {...register(p('residences'))} />
        <FieldError message={errorAt(errors, p('residences'))} />
      </div>

      {options.showFamilyStories && (
        <div>
          <Label htmlFor={id('familyStories')}>Семейни истории</Label>
          <Textarea id={id('familyStories')} rows={2} {...register(p('familyStories'))} />
          <FieldError message={errorAt(errors, p('familyStories'))} />
        </div>
      )}

      {options.showInfoSource && (
        <div>
          <Label htmlFor={id('infoSource')}>Откъде е известна информацията</Label>
          <Input id={id('infoSource')} {...register(p('infoSource'))} />
          <FieldError message={errorAt(errors, p('infoSource'))} />
        </div>
      )}
    </div>
  );
}
