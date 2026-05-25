// Sniffs the first few bytes of a file to decide its actual image
// mime type rather than trusting whatever Content-Type the upstream
// declared. LINE has been known to mislabel and a browser-trusted
// MIME is a classic XSS vector via image-shaped HTML.

export type ImageMime = 'image/jpeg' | 'image/png' | 'image/gif' | 'image/webp';

const SIGNATURES: { mime: ImageMime; prefix: number[] }[] = [
  // FF D8 FF
  { mime: 'image/jpeg', prefix: [0xFF, 0xD8, 0xFF] },
  // 89 50 4E 47 0D 0A 1A 0A
  { mime: 'image/png',  prefix: [0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A] },
  // 47 49 46 38 (covers both GIF87a and GIF89a)
  { mime: 'image/gif',  prefix: [0x47, 0x49, 0x46, 0x38] },
];

const startsWith = (bytes: Uint8Array, prefix: number[]): boolean => {
  if (bytes.length < prefix.length) return false;
  for (let i = 0; i < prefix.length; i++) {
    if (bytes[i] !== prefix[i]) return false;
  }
  return true;
};

// WebP has a split header: 'RIFF' at byte 0, 4 bytes of size, then
// 'WEBP' at byte 8 — too irregular to fit the simple prefix table.
const isWebp = (bytes: Uint8Array): boolean => (
  bytes.length >= 12
  && bytes[0] === 0x52 && bytes[1] === 0x49 && bytes[2] === 0x46 && bytes[3] === 0x46
  && bytes[8] === 0x57 && bytes[9] === 0x45 && bytes[10] === 0x42 && bytes[11] === 0x50
);

export const detectImageMime = (bytes: Uint8Array): ImageMime | null => {
  for (const sig of SIGNATURES) {
    if (startsWith(bytes, sig.prefix)) return sig.mime;
  }
  if (isWebp(bytes)) return 'image/webp';
  return null;
};
