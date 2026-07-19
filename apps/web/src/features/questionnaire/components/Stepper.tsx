'use client';

import { STEP_TITLES } from '../labels';
import { STEP_COUNT } from '../store';
import { cn } from '@/lib/utils';

/** Progress indicator: full labels on desktop, a compact counter on mobile. */
export function Stepper({ step }: { step: number }) {
  return (
    <div className="mb-6">
      {/* Mobile: compact "Стъпка N от M" + bar. */}
      <div className="sm:hidden">
        <p className="text-sm font-medium">
          Стъпка {step + 1} от {STEP_COUNT}
        </p>
        <p className="text-sm text-muted-foreground">{STEP_TITLES[step]}</p>
        <div className="mt-2 h-1.5 w-full rounded-full bg-muted">
          <div
            className="h-1.5 rounded-full bg-primary transition-all"
            style={{ width: `${((step + 1) / STEP_COUNT) * 100}%` }}
          />
        </div>
      </div>

      {/* Desktop: numbered steps. */}
      <ol className="hidden items-center gap-2 sm:flex" aria-label="Стъпки на въпросника">
        {STEP_TITLES.map((title, i) => (
          <li key={title} className="flex items-center gap-2">
            <span
              className={cn(
                'flex h-7 w-7 shrink-0 items-center justify-center rounded-full border text-xs',
                i === step && 'border-primary bg-primary text-primary-foreground',
                i < step && 'border-primary bg-primary/10 text-primary',
                i > step && 'text-muted-foreground',
              )}
              aria-current={i === step ? 'step' : undefined}
            >
              {i + 1}
            </span>
            <span
              className={cn('text-xs', i === step ? 'font-medium' : 'text-muted-foreground')}
            >
              {title}
            </span>
            {i < STEP_TITLES.length - 1 && <span className="text-muted-foreground">·</span>}
          </li>
        ))}
      </ol>
    </div>
  );
}
