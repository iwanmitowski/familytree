import type { AllowedContentType } from './sniff';

/**
 * Removes embedded metadata (EXIF/GPS/XMP and textual chunks) from an image,
 * in pure JS — no native dependency (idea.md §24 Phase 6, "image metadata
 * removal"). The goal is privacy: no location or camera data survives storage.
 * Pixel data is preserved byte-for-byte; only metadata segments are dropped.
 */
export function stripImageMetadata(buf: Buffer, contentType: AllowedContentType): Buffer {
  if (contentType === 'image/jpeg') return stripJpeg(buf);
  if (contentType === 'image/png') return stripPng(buf);
  if (contentType === 'image/webp') return stripWebp(buf);
  return buf;
}

/** Drops APPn (n>=1: EXIF/XMP/ICC) and COM segments; keeps APP0/JFIF + image data. */
function stripJpeg(buf: Buffer): Buffer {
  if (buf.length < 2 || buf[0] !== 0xff || buf[1] !== 0xd8) return buf; // not a JPEG
  const out: Buffer[] = [buf.subarray(0, 2)]; // SOI
  let i = 2;
  while (i + 1 < buf.length) {
    if (buf[i] !== 0xff) break;
    const marker = buf[i + 1]!;
    // Start of scan → copy the rest verbatim (compressed image data follows).
    if (marker === 0xda) {
      out.push(buf.subarray(i));
      break;
    }
    // Standalone markers (RSTn, SOI, EOI, TEM) have no length.
    if (marker === 0xd8 || marker === 0xd9 || (marker >= 0xd0 && marker <= 0xd7) || marker === 0x01) {
      out.push(buf.subarray(i, i + 2));
      i += 2;
      continue;
    }
    const len = buf.readUInt16BE(i + 2);
    const segEnd = i + 2 + len;
    const isMetadata = (marker >= 0xe1 && marker <= 0xef) || marker === 0xfe; // APP1..APPF, COM
    if (!isMetadata) out.push(buf.subarray(i, segEnd));
    i = segEnd;
  }
  return Buffer.concat(out);
}

/** Keeps only critical + rendering chunks; drops text/EXIF/time chunks. */
function stripPng(buf: Buffer): Buffer {
  const sig = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  if (buf.length < 8 || !buf.subarray(0, 8).equals(sig)) return buf;
  const DROP = new Set(['tEXt', 'zTXt', 'iTXt', 'eXIf', 'tIME', 'iCCP']);
  const out: Buffer[] = [sig];
  let i = 8;
  while (i + 8 <= buf.length) {
    const len = buf.readUInt32BE(i);
    const type = buf.toString('ascii', i + 4, i + 8);
    const chunkEnd = i + 12 + len; // length(4) + type(4) + data(len) + crc(4)
    if (chunkEnd > buf.length) break;
    if (!DROP.has(type)) out.push(buf.subarray(i, chunkEnd));
    i = chunkEnd;
    if (type === 'IEND') break;
  }
  return Buffer.concat(out);
}

/** Drops EXIF/XMP chunks from a RIFF/WEBP container; updates the RIFF size. */
function stripWebp(buf: Buffer): Buffer {
  if (buf.length < 12 || buf.toString('ascii', 0, 4) !== 'RIFF' || buf.toString('ascii', 8, 12) !== 'WEBP') return buf;
  const out: Buffer[] = [];
  let i = 12;
  while (i + 8 <= buf.length) {
    const fourcc = buf.toString('ascii', i, i + 4);
    const size = buf.readUInt32LE(i + 4);
    const padded = size + (size % 2); // chunks are even-padded
    const chunkEnd = i + 8 + padded;
    if (chunkEnd > buf.length) break;
    if (fourcc !== 'EXIF' && fourcc !== 'XMP ') out.push(buf.subarray(i, chunkEnd));
    i = chunkEnd;
  }
  const body = Buffer.concat(out);
  const header = Buffer.alloc(12);
  header.write('RIFF', 0, 'ascii');
  header.writeUInt32LE(body.length + 4, 4); // size = 'WEBP' + chunks
  header.write('WEBP', 8, 'ascii');
  return Buffer.concat([header, body]);
}
