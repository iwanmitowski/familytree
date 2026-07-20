export type AllowedContentType = 'image/jpeg' | 'image/png' | 'image/webp' | 'application/pdf';

export const ALLOWED_CONTENT_TYPES: readonly AllowedContentType[] = [
  'image/jpeg',
  'image/png',
  'image/webp',
  'application/pdf',
];

export const MAX_FILE_BYTES = 10 * 1024 * 1024; // 10 MB

/**
 * Detects the content type from the file's MAGIC BYTES, never the client header
 * (idea.md §24 Phase 6). Anything outside the allowlist returns null — so an
 * `.exe` renamed to `.jpg` is rejected.
 */
export function sniffContentType(buf: Buffer): AllowedContentType | null {
  if (buf.length < 12) return null;
  // JPEG: FF D8 FF
  if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return 'image/jpeg';
  // PNG: 89 50 4E 47 0D 0A 1A 0A
  if (buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47) return 'image/png';
  // WEBP: "RIFF" .... "WEBP"
  if (buf.toString('ascii', 0, 4) === 'RIFF' && buf.toString('ascii', 8, 12) === 'WEBP') return 'image/webp';
  // PDF: "%PDF"
  if (buf.toString('ascii', 0, 4) === '%PDF') return 'application/pdf';
  return null;
}

export function isImage(contentType: AllowedContentType): boolean {
  return contentType !== 'application/pdf';
}
