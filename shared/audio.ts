// Sniffs the first few bytes of a file to decide its actual audio
// mime type rather than trusting LINE's reported Content-Type. The
// XSS angle is lower than for images (audio files don't get parsed
// by browsers as HTML) but file-type spoofing still lets a mislabelled
// blob into the Whisper pipeline and burn quota; cheap to defend.
//
// LINE audio messages are always M4A (AAC inside an MP4 container).
// We only accept that one format — if the LINE API surface ever adds
// raw mp3 / ogg etc. uploads, extend here.

export type AudioMime = 'audio/m4a';

// M4A / MP4 container layout:
//   bytes 0-3: 4-byte box size (big-endian uint32)
//   bytes 4-7: ASCII 'ftyp' (66 74 79 70)
//   bytes 8-11: brand — 'M4A ', 'mp42', 'isom', 'M4B ' all valid
// Reading the brand isn't necessary for safety: the presence of a
// well-formed `ftyp` box at offset 4 is the actual signature browsers
// and ffmpeg key off too.
const isMp4Container = (bytes: Uint8Array): boolean => (
  bytes.length >= 8
  && bytes[4] === 0x66
  && bytes[5] === 0x74
  && bytes[6] === 0x79
  && bytes[7] === 0x70
);

export const detectAudioMime = (bytes: Uint8Array): AudioMime | null => {
  if (isMp4Container(bytes)) return 'audio/m4a';
  return null;
};
