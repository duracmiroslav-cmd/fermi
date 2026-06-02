import { Converter } from 'opencc-js/cn2t';

// Building the s2tw converter loads + tries the dictionary (~180ms);
// the conversion itself is ~2ms. Lazily built once per warm Edge
// Function instance and reused, so an agent with normalize off (or a
// purely non-Chinese workload) never pays the construction cost.
let convert: ((text: string) => string) | null = null;

// Simplified → Taiwan Traditional, char-level (s2tw). Idempotent on
// already-Traditional and non-Chinese text, so the worker runs it
// unconditionally when the agent opts in — no Simplified detection.
export const normalizeTraditional = (text: string): string => {
  convert ??= Converter({ from: 'cn', to: 'tw' });
  return convert(text);
};
