'use client';

import { Turnstile } from '@marsidev/react-turnstile';

const SITE_KEY = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY;

/**
 * Cloudflare Turnstile widget (idea.md §6). Calls onVerify with a token on
 * success and onExpire/onError so the caller can re-gate the submit button.
 * When no site key is configured (local dev without Turnstile) it renders a
 * notice and does not block — the server still verifies in production.
 */
export function TurnstileWidget({
  onVerify,
  onExpire,
  onError,
}: {
  onVerify: (token: string) => void;
  onExpire: () => void;
  onError: () => void;
}) {
  if (!SITE_KEY) {
    return (
      <p className="text-xs text-muted-foreground">
        (Проверката за защита от роботи е неактивна в тази среда.)
      </p>
    );
  }
  return (
    <Turnstile
      siteKey={SITE_KEY}
      options={{ language: 'bg' }}
      onSuccess={onVerify}
      onExpire={onExpire}
      onError={onError}
    />
  );
}

/** True when Turnstile is not configured (dev) — the submit gate is relaxed. */
export const TURNSTILE_DISABLED = !SITE_KEY;
