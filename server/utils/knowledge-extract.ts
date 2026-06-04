// Pulls plain text out of an uploaded knowledge file, server-side, so the
// ingestion path can chunk + embed it. Stays in-stack (no Python / no external
// service): plain-text/JSON read directly, PDFs via unpdf (pure JS), and both
// legacy .doc (OLE binary) and modern .docx via word-extractor. Office long-
// tail (pptx/xlsx/epub) is intentionally out of scope — see the evaluation in
// the knowledge-base plan; add markitdown only if those are ever demanded.

import { extractText, getDocumentProxy } from 'unpdf';
import WordExtractor from 'word-extractor';

const wordExtractor = new WordExtractor();

const extOf = (filename: string): string =>
  filename.toLowerCase().match(/\.[^.]+$/)?.[0] ?? '';

export const KNOWLEDGE_FILE_EXTENSIONS = [
  '.txt', '.md', '.markdown', '.text', '.json', '.pdf', '.doc', '.docx',
] as const;

export class UnsupportedFileError extends Error {}

export const extractDocumentText = async (filename: string, data: Buffer): Promise<string> => {
  switch (extOf(filename)) {
    case '.txt':
    case '.md':
    case '.markdown':
    case '.text':
    case '.json':
      return data.toString('utf-8');

    case '.pdf': {
      // mergePages joins every page into one string; the chunker re-splits on
      // structure afterward. NFKC folds compatibility codepoints to canonical
      // forms — some PDF text layers encode CJK glyphs as Kangxi-radical
      // codepoints (e.g. "子" U+5B50 → "⼦" U+2F26): visually identical but a
      // different character, so a normally-typed query would never match.
      const pdf = await getDocumentProxy(new Uint8Array(data));
      const { text } = await extractText(pdf, { mergePages: true });
      return text.normalize('NFKC');
    }

    case '.doc':
    case '.docx': {
      // NFKC for the same reason as the PDF branch (canonicalize CJK / width
      // variants the extractor may emit).
      const doc = await wordExtractor.extract(data);
      return doc.getBody().normalize('NFKC');
    }

    default:
      throw new UnsupportedFileError(`Unsupported file type: ${extOf(filename) || filename}`);
  }
};
