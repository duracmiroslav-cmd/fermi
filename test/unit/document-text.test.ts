import { strToU8, zipSync } from 'fflate';
import { describe, expect, it } from 'vitest';
import {
  KNOWLEDGE_FILE_EXTENSIONS,
  UnsupportedFileError,
  extractDocumentText,
  isSupportedDocumentFilename,
} from '../../shared/documentText';

// Builds a minimal .docx (the one part the extractor reads) so the docx path
// is tested hermetically — no committed binary fixture. Text is XML-escaped
// exactly as Word writes it, so the extractor's entity decode round-trips.
const xmlEscape = (s: string): string =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

const makeDocx = (paragraphs: string[]): Uint8Array => {
  const body = paragraphs
    .map(p => `<w:p><w:r><w:t xml:space="preserve">${xmlEscape(p)}</w:t></w:r></w:p>`)
    .join('');
  const xml = `<?xml version="1.0"?><w:document><w:body>${body}</w:body></w:document>`;
  return zipSync({ 'word/document.xml': strToU8(xml) });
};

describe('extractDocumentText', () => {
  it('decodes plain-text variants as UTF-8', async () => {
    const bytes = new TextEncoder().encode('週二公休\nhours 9–5');
    expect(await extractDocumentText('notes.txt', bytes)).toBe('週二公休\nhours 9–5');
    expect(await extractDocumentText('notes.md', bytes)).toBe('週二公休\nhours 9–5');
  });

  it('pulls text out of a .docx, one newline per paragraph', async () => {
    const text = await extractDocumentText('menu.docx', makeDocx(['第一段', '第二段']));
    expect(text).toBe('第一段\n第二段\n');
  });

  it('decodes XML entities in .docx text', async () => {
    const text = await extractDocumentText('x.docx', makeDocx(['Tom & Jerry <v2>']));
    expect(text.trim()).toBe('Tom & Jerry <v2>');
  });

  // The extractor reads word/document.xml out of a zip that, in a real .docx,
  // also holds [Content_Types].xml, rels, styles, etc. The size-guard filter
  // must still select the right part among the siblings.
  it('extracts document.xml from a multi-part .docx, ignoring siblings', async () => {
    const xml = '<?xml version="1.0"?><w:document><w:body>'
      + '<w:p><w:r><w:t>實際內容</w:t></w:r></w:p></w:body></w:document>';
    const zip = zipSync({
      '[Content_Types].xml': strToU8('<Types/>'),
      '_rels/.rels':         strToU8('<Relationships/>'),
      'word/document.xml':   strToU8(xml),
      'word/styles.xml':     strToU8('<w:styles/>'),
    });
    expect((await extractDocumentText('real.docx', zip)).trim()).toBe('實際內容');
  });

  // Raw (unescaped) numeric refs straight in the XML — makeDocx can't produce
  // these since it escapes content, so build document.xml by hand.
  const docxWithRawXml = (inner: string): Uint8Array => {
    const xml = '<?xml version="1.0"?><w:document><w:body><w:p><w:r>'
      + `<w:t xml:space="preserve">${inner}</w:t></w:r></w:p></w:body></w:document>`;
    return zipSync({ 'word/document.xml': strToU8(xml) });
  };

  it('decodes in-range numeric character references', async () => {
    expect((await extractDocumentText('n.docx', docxWithRawXml('&#65;&#x42;'))).trim()).toBe('AB');
  });

  it('drops an out-of-range numeric reference instead of throwing', async () => {
    const text = await extractDocumentText('bad.docx', docxWithRawXml('X&#x110000;Y'));
    expect(text.trim()).toBe('XY');
  });

  it('returns empty for a .docx with no document part (e.g. a renamed zip)', async () => {
    const notDocx = zipSync({ 'other.txt': strToU8('hi') });
    expect(await extractDocumentText('fake.docx', notDocx)).toBe('');
  });

  it('rejects unsupported extensions, including legacy .doc', async () => {
    const bytes = new TextEncoder().encode('x');
    await expect(extractDocumentText('legacy.doc', bytes)).rejects.toBeInstanceOf(UnsupportedFileError);
    await expect(extractDocumentText('sheet.xlsx', bytes)).rejects.toBeInstanceOf(UnsupportedFileError);
  });

  it('gates filenames against the supported set', () => {
    expect(isSupportedDocumentFilename('a.PDF')).toBe(true);
    expect(isSupportedDocumentFilename('a.docx')).toBe(true);
    expect(isSupportedDocumentFilename('a.doc')).toBe(false);
    expect(isSupportedDocumentFilename('a.png')).toBe(false);
    expect(KNOWLEDGE_FILE_EXTENSIONS).not.toContain('.doc');
  });
});
