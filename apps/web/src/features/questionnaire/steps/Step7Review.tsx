'use client';

import { useState, type ReactNode } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { CONSENT_LABELS } from '../labels';
import { useQuestionnaire } from '../store';
import { clearDraft } from '../draft';
import { StepNav } from '../components/StepNav';
import { TurnstileWidget, TURNSTILE_DISABLED } from '../components/TurnstileWidget';
import { submitQuestionnaire } from '../submit';

type Values = Record<string, unknown>;

function str(values: Values, key: string): string | undefined {
  const v = values[key];
  return typeof v === 'string' && v ? v : undefined;
}
function block(values: Values, key: string): Values | undefined {
  const v = values[key];
  return v && typeof v === 'object' ? (v as Values) : undefined;
}
function personName(b: Values | undefined): string | undefined {
  if (!b) return undefined;
  const parts = [b.firstName, b.surname].filter((p) => typeof p === 'string' && p);
  return parts.length ? parts.join(' ') : undefined;
}
function arrLen(values: Values, key: string): number {
  const v = values[key];
  return Array.isArray(v) ? v.filter((x) => personName(x as Values)).length : 0;
}

function SummaryRow({ label, children, onEdit }: { label: string; children: ReactNode; onEdit: () => void }) {
  return (
    <div className="flex items-start justify-between gap-4 border-b py-2">
      <div>
        <p className="text-sm font-medium">{label}</p>
        <div className="text-sm text-muted-foreground">{children}</div>
      </div>
      <Button type="button" variant="link" size="sm" className="h-auto p-0" onClick={onEdit}>
        Редактирай
      </Button>
    </div>
  );
}

function Nudge({ children }: { children: ReactNode }) {
  return <p className="text-sm text-amber-700 dark:text-amber-500">{children}</p>;
}

const CONSENT_FIELDS = [
  { key: 'consentContact', type: 'contact' },
  { key: 'consentFamilyVisibility', type: 'family_visibility' },
  { key: 'consentPublicDisplay', type: 'public_display' },
  { key: 'consentMediaUsage', type: 'media_usage' },
] as const;

export function Step7Review() {
  const { values, formStartedAt, back, goTo } = useQuestionnaire();
  const router = useRouter();
  const searchParams = useSearchParams();
  const inviteToken = searchParams.get('invite') ?? undefined;

  const [token, setToken] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [consents, setConsents] = useState({
    consentDataProcessing: values.consentDataProcessing === true,
    consentContact: false,
    consentFamilyVisibility: false,
    consentPublicDisplay: false,
    consentMediaUsage: false,
  });

  const self = block(values, 'self');
  const father = personName(block(values, 'father'));
  const mother = personName(block(values, 'mother'));
  const grandparents = ['paternalGrandfather', 'paternalGrandmother', 'maternalGrandfather', 'maternalGrandmother']
    .map((k) => personName(block(values, k)))
    .filter(Boolean);

  const submitDisabled =
    pending || !consents.consentDataProcessing || (!TURNSTILE_DISABLED && !token);

  async function onSubmit() {
    setPending(true);
    setError(null);
    const result = await submitQuestionnaire({
      values: { ...values, ...consents },
      formStartedAt,
      turnstileToken: token ?? 'dev-no-turnstile',
      inviteToken,
    });
    if (result.ok) {
      clearDraft();
      router.push(`/questionnaire/success?ref=${result.referenceCode}`);
      return;
    }
    setPending(false);
    switch (result.kind) {
      case 'rate_limited':
        setError('Получихме твърде много заявки от Вас. Моля, опитайте по-късно.');
        break;
      case 'turnstile':
        setError('Проверката за защита от роботи не бе успешна. Опитайте отново.');
        setToken(null);
        break;
      case 'validation':
        setError('Някои от данните са невалидни. Прегледайте попълненото и опитайте отново.');
        break;
      default:
        setError('Възникна грешка при изпращането. Данните Ви са запазени — опитайте отново.');
    }
  }

  return (
    <div>
      <p className="mb-4 text-sm text-muted-foreground">
        Прегледайте информацията и потвърдете съгласията си, преди да изпратите.
      </p>

      <div className="mb-6 rounded-md border p-4">
        <SummaryRow label="Участник" onEdit={() => goTo(0)}>
          {str(values, 'participantName') ?? '—'}
        </SummaryRow>
        <SummaryRow label="За Вас" onEdit={() => goTo(1)}>
          {personName(self) ?? '—'}
          {self?.birthYear ? `, р. ${String(self.birthYear)}` : ''}
        </SummaryRow>
        <SummaryRow label="Родители" onEdit={() => goTo(2)}>
          {father || mother ? [father, mother].filter(Boolean).join(' · ') : <Nudge>Не сте описали родителите — дори само имената помагат.</Nudge>}
        </SummaryRow>
        <SummaryRow label="Баби и дядовци" onEdit={() => goTo(3)}>
          {grandparents.length ? grandparents.join(' · ') : <Nudge>Не сте описали баби и дядовци — дори само имената помагат.</Nudge>}
        </SummaryRow>
        <SummaryRow label="Други роднини" onEdit={() => goTo(4)}>
          {`Братя/сестри: ${arrLen(values, 'siblings')}, деца: ${arrLen(values, 'children')}, партньори: ${arrLen(values, 'partners')}, други: ${arrLen(values, 'unclesAunts') + arrLen(values, 'otherRelatives')}`}
        </SummaryRow>
        <SummaryRow label="Произход" onEdit={() => goTo(5)}>
          {str(values, 'oldestKnownSettlement') ?? <Nudge>Не сте попълнили информация за произхода.</Nudge>}
        </SummaryRow>
      </div>

      <fieldset className="mb-6 grid gap-3">
        <legend className="mb-1 text-sm font-medium">Съгласия</legend>
        <label className="flex items-start gap-2 text-sm">
          <input
            type="checkbox"
            className="mt-1"
            checked={consents.consentDataProcessing}
            onChange={(e) => setConsents((c) => ({ ...c, consentDataProcessing: e.target.checked }))}
          />
          <span>{CONSENT_LABELS.data_processing} (задължително)</span>
        </label>
        {CONSENT_FIELDS.map((f) => (
          <label key={f.key} className="flex items-start gap-2 text-sm">
            <input
              type="checkbox"
              className="mt-1"
              checked={consents[f.key]}
              onChange={(e) => setConsents((c) => ({ ...c, [f.key]: e.target.checked }))}
            />
            <span>{CONSENT_LABELS[f.type]}</span>
          </label>
        ))}
      </fieldset>

      <div className="mb-4">
        <TurnstileWidget
          onVerify={setToken}
          onExpire={() => setToken(null)}
          onError={() => setToken(null)}
        />
      </div>

      {error && (
        <p className="mb-4 text-sm text-destructive" role="alert">
          {error}
        </p>
      )}

      <form
        onSubmit={(e) => {
          e.preventDefault();
          void onSubmit();
        }}
      >
        <StepNav
          canBack
          onBack={back}
          submitLabel={pending ? 'Изпращане…' : 'Изпрати'}
          submitDisabled={submitDisabled}
        />
        {submitDisabled && !pending && (
          <p className="mt-2 text-xs text-muted-foreground">
            Отбележете задължителното съгласие
            {!TURNSTILE_DISABLED && ' и преминете проверката за роботи'}, за да изпратите.
          </p>
        )}
      </form>
    </div>
  );
}
