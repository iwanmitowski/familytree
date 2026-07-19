import { describe, expect, it } from 'vitest';
import { clientFingerprint, extractClientIp, normalizeIp } from './fingerprint';

const SECRET = 'fingerprint-secret-0123456789abcdef';

describe('normalizeIp', () => {
  it('lowercases and trims', () => {
    expect(normalizeIp('  2001:DB8::1  ')).toBe('2001:db8::1');
  });

  it('strips an IPv4 port', () => {
    expect(normalizeIp('203.0.113.7:54321')).toBe('203.0.113.7');
  });

  it('strips brackets and port from IPv6', () => {
    expect(normalizeIp('[2001:db8::1]:443')).toBe('2001:db8::1');
  });

  it('drops an IPv6 zone id', () => {
    expect(normalizeIp('fe80::1%eth0')).toBe('fe80::1');
  });

  it('unwraps IPv4-mapped IPv6', () => {
    expect(normalizeIp('::ffff:203.0.113.7')).toBe('203.0.113.7');
  });

  it('leaves a bare IPv6 address untouched', () => {
    expect(normalizeIp('2001:db8::dead:beef')).toBe('2001:db8::dead:beef');
  });
});

describe('clientFingerprint', () => {
  it('is deterministic and hex', () => {
    const fp = clientFingerprint('203.0.113.7', SECRET);
    expect(fp).toMatch(/^[0-9a-f]{64}$/);
    expect(clientFingerprint('203.0.113.7', SECRET)).toBe(fp);
  });

  it('collapses representation differences (mapped vs bare, port)', () => {
    expect(clientFingerprint('::ffff:203.0.113.7', SECRET)).toBe(
      clientFingerprint('203.0.113.7:8080', SECRET),
    );
  });

  it('changes with the secret and never equals the raw IP', () => {
    const ip = '203.0.113.7';
    const fp = clientFingerprint(ip, SECRET);
    expect(fp).not.toContain(ip);
    expect(clientFingerprint(ip, 'a-different-secret-000000000000')).not.toBe(fp);
  });
});

describe('extractClientIp', () => {
  it('takes the first hop of x-forwarded-for', () => {
    const headers = new Headers({ 'x-forwarded-for': '203.0.113.7, 70.41.3.18, 150.172.238.178' });
    expect(extractClientIp(headers)).toBe('203.0.113.7');
  });

  it('falls back to x-real-ip', () => {
    expect(extractClientIp(new Headers({ 'x-real-ip': '198.51.100.9' }))).toBe('198.51.100.9');
  });

  it('returns undefined when no proxy headers are present', () => {
    expect(extractClientIp(new Headers())).toBeUndefined();
  });
});
