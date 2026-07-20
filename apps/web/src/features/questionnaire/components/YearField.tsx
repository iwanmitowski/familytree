'use client';

import { useEffect, useRef, useState } from 'react';
import type { FieldValues, Path, UseFormRegister, UseFormSetValue } from 'react-hook-form';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { FieldError } from './PersonBlockFields';

const MIN_YEAR = 1800;
const CURRENT_YEAR = new Date().getFullYear();
const PAGE = 12;

/**
 * Year input with a calendar-like picker (idea.md §9): a decade grid you can
 * page through, plus a plain numeric input for typing. Only a YEAR is collected
 * — never an exact date — so living people keep their privacy.
 */
export function YearField<T extends FieldValues>({
  name,
  id,
  label,
  register,
  setValue,
  value,
  error,
}: {
  name: Path<T>;
  id: string;
  label: string;
  register: UseFormRegister<T>;
  setValue: UseFormSetValue<T>;
  value: number | undefined;
  error?: string;
}) {
  const [open, setOpen] = useState(false);
  // First year shown in the grid — roughly centred on the chosen year, or the
  // most recent page when nothing is picked yet.
  const anchorFor = (v: number | undefined) =>
    Math.max(MIN_YEAR, Math.min((v ?? CURRENT_YEAR) - 5, CURRENT_YEAR - PAGE + 1));
  const [pageStart, setPageStart] = useState(() => anchorFor(value));
  const wrapRef = useRef<HTMLDivElement>(null);

  // Close on outside click.
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [open]);

  const pick = (year: number) => {
    setValue(name, year as never, { shouldValidate: true, shouldDirty: true });
    setOpen(false);
  };

  const years = Array.from({ length: PAGE }, (_, i) => pageStart + i);

  return (
    <div ref={wrapRef} className="relative">
      <Label htmlFor={id}>{label}</Label>
      <div className="flex gap-1">
        <Input
          id={id}
          type="number"
          inputMode="numeric"
          placeholder="напр. 1952"
          min={MIN_YEAR}
          max={CURRENT_YEAR}
          {...register(name, { setValueAs: (v) => (v === '' || v == null ? undefined : Number(v)) })}
        />
        <button
          type="button"
          aria-label={`Избор на година: ${label}`}
          aria-expanded={open}
          onClick={() => {
            if (!open) setPageStart(anchorFor(value));
            setOpen(!open);
          }}
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md border border-input bg-transparent text-muted-foreground transition hover:bg-accent hover:text-accent-foreground"
        >
          📅
        </button>
      </div>
      <p className="mt-1 text-xs text-muted-foreground">Приблизителна година е достатъчна.</p>
      <FieldError message={error} />

      {open && (
        <div className="absolute z-20 mt-1 w-64 rounded-lg border bg-popover p-2 shadow-md">
          <div className="mb-2 flex items-center justify-between">
            <button
              type="button"
              aria-label="Предишни години"
              disabled={pageStart <= MIN_YEAR}
              onClick={() => setPageStart((s) => Math.max(MIN_YEAR, s - PAGE))}
              className="rounded-md px-2 py-1 text-sm hover:bg-accent disabled:opacity-40"
            >
              ←
            </button>
            <span className="text-sm font-medium">
              {pageStart} – {Math.min(pageStart + PAGE - 1, CURRENT_YEAR)}
            </span>
            <button
              type="button"
              aria-label="Следващи години"
              disabled={pageStart + PAGE > CURRENT_YEAR}
              onClick={() => setPageStart((s) => Math.min(s + PAGE, CURRENT_YEAR - PAGE + 1))}
              className="rounded-md px-2 py-1 text-sm hover:bg-accent disabled:opacity-40"
            >
              →
            </button>
          </div>
          <div className="grid grid-cols-4 gap-1">
            {years.map((y) => (
              <button
                key={y}
                type="button"
                disabled={y > CURRENT_YEAR}
                onClick={() => pick(y)}
                className={`rounded-md px-2 py-1.5 text-sm transition hover:bg-accent disabled:opacity-30 ${
                  y === value ? 'bg-primary text-primary-foreground hover:bg-primary' : ''
                }`}
              >
                {y}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
