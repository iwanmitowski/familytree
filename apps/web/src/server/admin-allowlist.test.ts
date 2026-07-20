import { describe, expect, it } from 'vitest';
import { isAllowedAdmin, parseAllowlist } from './admin-allowlist';

describe('admin allowlist', () => {
  it('matches case-insensitively and ignores surrounding spaces', () => {
    const csv = ' Admin@Example.com , second@example.com ';
    expect(isAllowedAdmin('admin@example.com', csv)).toBe(true);
    expect(isAllowedAdmin('ADMIN@EXAMPLE.COM', csv)).toBe(true);
    expect(isAllowedAdmin('second@example.com', csv)).toBe(true);
  });

  it('rejects unknown, empty, and null emails', () => {
    const csv = 'admin@example.com';
    expect(isAllowedAdmin('intruder@example.com', csv)).toBe(false);
    expect(isAllowedAdmin('', csv)).toBe(false);
    expect(isAllowedAdmin(null, csv)).toBe(false);
    expect(isAllowedAdmin(undefined, csv)).toBe(false);
  });

  it('treats an empty or missing allowlist as no admins', () => {
    expect(isAllowedAdmin('admin@example.com', '')).toBe(false);
    expect(isAllowedAdmin('admin@example.com', undefined)).toBe(false);
    expect(parseAllowlist('').size).toBe(0);
  });

  it('parses multiple entries', () => {
    expect(parseAllowlist('a@x.com, b@x.com,,c@x.com').size).toBe(3);
  });
});
