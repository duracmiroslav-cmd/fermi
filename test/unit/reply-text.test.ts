import { describe, expect, it } from 'vitest';
import { normalizeReplyText } from '../../supabase/functions/agent/reply-text';

// One pass feeds both the LINE worker and the dashboard test chat, so these
// pin the two halves of "what every channel delivers": markdown is always
// flattened; the Simplified → Traditional pass is per-agent opt-in.
describe('normalizeReplyText', () => {
  it('always strips markdown, regardless of the traditional flag', () => {
    expect(normalizeReplyText('**hi** [x](https://x.com)', { traditional: false }))
      .toBe('hi x https://x.com');
    expect(normalizeReplyText('**hi** [x](https://x.com)', { traditional: true }))
      .toBe('hi x https://x.com');
  });

  it('normalizes to Taiwan Traditional only when opted in', () => {
    expect(normalizeReplyText('**内存**', { traditional: true })).toBe('內存');
    expect(normalizeReplyText('**内存**', { traditional: false })).toBe('内存');
  });
});
