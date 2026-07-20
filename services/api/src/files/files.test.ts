import { describe, expect, it } from 'vitest';
import { sniffContentType } from './sniff';
import { stripImageMetadata } from './strip';

function pad(bytes: number[], len = 16): Buffer {
  return Buffer.from([...bytes, ...new Array(Math.max(0, len - bytes.length)).fill(0)]);
}

describe('sniffContentType (magic-byte matrix)', () => {
  it('detects the four allowed types', () => {
    expect(sniffContentType(pad([0xff, 0xd8, 0xff, 0xe0]))).toBe('image/jpeg');
    expect(sniffContentType(pad([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))).toBe('image/png');
    expect(sniffContentType(Buffer.concat([Buffer.from('RIFF'), Buffer.alloc(4), Buffer.from('WEBP')]))).toBe('image/webp');
    expect(sniffContentType(Buffer.from('%PDF-1.7\n%abcd'))).toBe('application/pdf');
  });

  it('rejects an .exe renamed to .jpg (sniffs the real bytes)', () => {
    // MZ executable header — not in the allowlist.
    expect(sniffContentType(pad([0x4d, 0x5a, 0x90, 0x00]))).toBeNull();
  });

  it('rejects truncated input', () => {
    expect(sniffContentType(Buffer.from([0xff, 0xd8]))).toBeNull();
  });
});

describe('stripImageMetadata', () => {
  it('removes a JPEG APP1 (EXIF/GPS) segment but keeps image segments', () => {
    const soi = Buffer.from([0xff, 0xd8]);
    // APP1 with "Exif\0\0" + fake GPS payload.
    const exifPayload = Buffer.concat([Buffer.from('Exif\0\0'), Buffer.from('GPSLatitude:42.7')]);
    const app1 = Buffer.concat([Buffer.from([0xff, 0xe1]), u16(exifPayload.length + 2), exifPayload]);
    const dqt = Buffer.concat([Buffer.from([0xff, 0xdb]), u16(4), Buffer.from([0x00, 0x01])]);
    const sos = Buffer.from([0xff, 0xda, 0x00, 0x02, 0xaa, 0xbb, 0xff, 0xd9]);
    const jpeg = Buffer.concat([soi, app1, dqt, sos]);

    const stripped = stripImageMetadata(jpeg, 'image/jpeg');
    expect(stripped.includes(Buffer.from('Exif'))).toBe(false);
    expect(stripped.includes(Buffer.from('GPSLatitude'))).toBe(false);
    // The DQT and the compressed data (post-SOS) survive.
    expect(stripped.includes(Buffer.from([0xff, 0xdb]))).toBe(true);
    expect(stripped.includes(Buffer.from([0xff, 0xda]))).toBe(true);
  });

  it('removes PNG text chunks but keeps IHDR/IEND', () => {
    const sig = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
    const ihdr = chunk('IHDR', Buffer.alloc(13));
    const text = chunk('tEXt', Buffer.from('Comment\0secret gps'));
    const iend = chunk('IEND', Buffer.alloc(0));
    const png = Buffer.concat([sig, ihdr, text, iend]);

    const stripped = stripImageMetadata(png, 'image/png');
    expect(stripped.includes(Buffer.from('secret gps'))).toBe(false);
    expect(stripped.includes(Buffer.from('IHDR'))).toBe(true);
    expect(stripped.includes(Buffer.from('IEND'))).toBe(true);
  });
});

function u16(n: number): Buffer {
  const b = Buffer.alloc(2);
  b.writeUInt16BE(n);
  return b;
}

function chunk(type: string, data: Buffer): Buffer {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  return Buffer.concat([len, Buffer.from(type, 'ascii'), data, Buffer.alloc(4)]); // fake CRC
}
