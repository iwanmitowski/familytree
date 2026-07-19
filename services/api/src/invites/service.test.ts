import { describe, expect, it } from 'vitest';
import { createHash } from 'node:crypto';
import { generateToken, hashToken, toPublicInvite } from './service';
import type { InviteRow } from './repo';

describe('invite token helpers', () => {
  it('generates a prefixed, high-entropy token each time', () => {
    const a = generateToken();
    const b = generateToken();
    expect(a).toMatch(/^inv_[A-Za-z0-9_-]{40,}$/);
    expect(a).not.toBe(b);
  });

  it('hashes to a 64-char hex sha256 of the token', () => {
    const token = 'inv_example';
    expect(hashToken(token)).toBe(createHash('sha256').update(token).digest('hex'));
    expect(hashToken(token)).toMatch(/^[0-9a-f]{64}$/);
  });

  it('toPublicInvite never exposes the token hash and marks expiry', () => {
    const row: InviteRow = {
      id: 'id-1',
      token_hash: 'a'.repeat(64),
      recipient_label: 'Баба',
      campaign: 'snowball',
      expires_at: new Date(Date.now() - 1000),
      max_submissions: 3,
      used_submissions: 1,
      revoked_at: null,
      created_at: new Date(),
    };
    const pub = toPublicInvite(row);
    expect(JSON.stringify(pub)).not.toContain(row.token_hash);
    expect(pub.expired).toBe(true);
    expect(pub.recipientLabel).toBe('Баба');
  });
});
