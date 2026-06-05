// Document → plain text extraction, shared by dashboard knowledge-base
// ingestion (Nitro) and the worker's inline file reading (Deno). No `node:*`
// imports and no Buffer: unpdf and fflate are both pure-JS, so this resolves
// from the Nuxt node_modules and from the worker's deno.json import map alike.
//
// Text layer only — no OCR. A scanned / image-only PDF (or a photo of a
// document) extracts to nothing and surfaces as the empty-text path upstream.
// Legacy .doc (pre-2007 OLE binary) is intentionally unsupported: its only
// parser (word-extractor) is Node-only and would break the cross-runtime
// contract for a format that is vanishingly rare in 2026.

import { strFromU8, unzipSync } from 'fflate';
import { extractText, getDocumentProxy } from 'unpdf';

const extOf = (filename: string): string =>
  filename.toLowerCase().match(/\.[^.]+$/)?.[0] ?? '';

export const KNOWLEDGE_FILE_EXTENSIONS = [
  '.txt', '.md', '.markdown', '.text', '.json', '.pdf', '.docx',
] as const;

export const isSupportedDocumentFilename = (filename: string): boolean =>
  (KNOWLEDGE_FILE_EXTENSIONS as readonly string[]).includes(extOf(filename));

export class UnsupportedFileError extends Error {}

// A non-bomb word/document.xml for a document whose text fits the inline /
// ingestion caps is at most a couple MB; this ceiling stops a zip-bomb entry
// (a 10MB .docx can declare a multi-GB document.xml) from being inflated into
// memory before the downstream char cap ever sees text.
const MAX_DOCX_PART_BYTES = 50 * 1024 * 1024;

// Out-of-range numeric character references are dropped, not thrown on: one
// malformed &#…; must never sink an otherwise-readable document (fromCodePoint
// throws RangeError outside 0..0x10FFFF, and on Infinity from an absurd ref).
const fromNumericRef = (cp: number): string =>
  cp >= 0 && cp <= 0x10ffff ? String.fromCodePoint(cp) : '';

const decodeXmlEntities = (s: string): string =>
  s
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, '\'')
    .replace(/&#x([0-9a-fA-F]+);/g, (_, hex) => fromNumericRef(parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_, dec) => fromNumericRef(Number(dec)))
    // &amp; last so a literal "&lt;" encoded as "&amp;lt;" survives intact.
    .replace(/&amp;/g, '&');

// .docx is a zip whose body text lives in word/document.xml as <w:t> runs.
// Convert the structural markup that carries line breaks (paragraph end, <w:br/>,
// <w:tab/>) into whitespace first, then strip the remaining tags — leaving the
// text nodes — so the chunker's blank-line paragraph split has structure to act
// on. The filter rejects an oversized (or absent) part by its declared
// uncompressed size before fflate inflates it; returns '' in either case.
const extractDocx = (data: Uint8Array): string => {
  const body = unzipSync(data, {
    filter: f => f.name === 'word/document.xml' && f.originalSize <= MAX_DOCX_PART_BYTES,
  })['word/document.xml'];
  if (!body) return '';
  return decodeXmlEntities(
    strFromU8(body)
      .replace(/<\/w:p>/g, '\n')
      .replace(/<w:p\b[^>]*\/>/g, '\n')
      .replace(/<w:br\b[^>]*\/?>/g, '\n')
      .replace(/<w:tab\b[^>]*\/?>/g, '\t')
      .replace(/<[^>]+>/g, ''),
  );
};

export const extractDocumentText = async (filename: string, data: Uint8Array): Promise<string> => {
  switch (extOf(filename)) {
    case '.txt':
    case '.md':
    case '.markdown':
    case '.text':
    case '.json':
      return new TextDecoder('utf-8').decode(data);

    case '.pdf': {
      // Residual risk (accepted): a crafted PDF can make unpdf burn CPU/memory
      // during parse, unbounded by the downstream char cap. The 10MB input cap
      // and the runtime's wall-clock limit are the brakes; a malformed PDF
      // throws and is caught by the caller. Add a parse timeout if this proves
      // a real DoS in practice.
      //
      // mergePages joins every page into one string; the chunker re-splits on
      // structure afterward. NFKC folds compatibility codepoints to canonical
      // forms — some PDF text layers encode CJK glyphs as Kangxi-radical
      // codepoints (e.g. "子" U+5B50 → "⼦" U+2F26): visually identical but a
      // different character, so a normally-typed query would never match.
      const pdf = await getDocumentProxy(new Uint8Array(data));
      const { text } = await extractText(pdf, { mergePages: true });
      return text.normalize('NFKC');
    }

    case '.docx':
      // NFKC for the same reason as the PDF branch (canonicalize CJK / width
      // variants the document may carry).
      return extractDocx(data).normalize('NFKC');

    default:
      throw new UnsupportedFileError(`Unsupported file type: ${extOf(filename) || filename}`);
  }
};
