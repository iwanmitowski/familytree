import 'server-only';
import { createHmac } from 'node:crypto';

/**
 * Normalizes a client IP before hashing so trivial representation differences
 * (case, zone id, IPv4-mapped IPv6, surrounding brackets/port) collapse to one
 * fingerprint. Best-effort — an unparseable value is lowercased and trimmed.
 */
export function normalizeIp(raw: string): string {
  let ip = raw.trim().toLowerCase();
  if (!ip) return ip;

  // Strip [..]:port or bare host:port (IPv4). Keep bare IPv6.
  if (ip.startsWith('[')) {
    const close = ip.indexOf(']');
    if (close !== -1) ip = ip.slice(1, close);
  } else if ((ip.match(/:/g) ?? []).length === 1) {
    ip = ip.slice(0, ip.indexOf(':'));
  }

  // Drop an IPv6 zone id (fe80::1%eth0).
  const zone = ip.indexOf('%');
  if (zone !== -1) ip = ip.slice(0, zone);

  // IPv4-mapped IPv6 (::ffff:1.2.3.4) → 1.2.3.4.
  const mapped = ip.match(/^::ffff:(\d{1,3}(?:\.\d{1,3}){3})$/);
  if (mapped) ip = mapped[1]!;

  return ip;
}

/**
 * clientFingerprint = HMAC-SHA256(IP_HASH_SECRET, normalizedIp) (idea.md §6).
 * The raw IP is used only to derive this and is never stored or forwarded.
 */
export function clientFingerprint(ip: string, secret: string): string {
  return createHmac('sha256', secret).update(normalizeIp(ip)).digest('hex');
}

/**
 * Extracts the client IP from proxy headers. On Vercel the first hop of
 * x-forwarded-for is the real client. Returns undefined when nothing usable.
 */
export function extractClientIp(headers: Headers): string | undefined {
  const forwarded = headers.get('x-forwarded-for');
  if (forwarded) {
    const first = forwarded.split(',')[0]?.trim();
    if (first) return first;
  }
  return headers.get('x-real-ip')?.trim() || undefined;
}
