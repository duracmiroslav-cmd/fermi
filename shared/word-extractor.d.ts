// word-extractor ships no type declarations. Minimal ambient declaration for
// the surface we use (extract a .doc/.docx buffer, read its body text).
declare module 'word-extractor' {
  interface WordDocument {
    getBody(): string;
    getFootnotes(): string;
    getHeaders(): string;
    getEndnotes(): string;
  }
  class WordExtractor {
    extract(input: string | Buffer): Promise<WordDocument>;
  }
  export default WordExtractor;
}
