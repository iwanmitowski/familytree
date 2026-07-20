/**
 * Admin email allowlist (idea.md §5). Case-insensitive, comma-separated.
 * Pure and edge-safe so it can run in middleware.
 */
export function parseAllowlist(csv: string | undefined): Set<string> {
  return new Set(
    (csv ?? '')
      .split(',')
      .map((s) => s.trim().toLowerCase())
      .filter(Boolean),
  );
}

export function isAllowedAdmin(email: string | null | undefined, csv: string | undefined): boolean {
  if (!email) return false;
  return parseAllowlist(csv).has(email.toLowerCase());
}
