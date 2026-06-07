import { stripMarkdown } from './markdown.ts';
import { normalizeTraditional } from './opencc.ts';

// The exact text every channel delivers. The LINE worker (agent) and the
// dashboard agent chat (agent-invoke) both run replies through here, so
// what an owner sees while testing matches what their users get: markdown
// flattened to LINE-safe plain text (LINE renders none), then optionally
// Simplified → Taiwan Traditional. One shared pass is what keeps the two
// paths from drifting. Stripping is unconditional — markdown never belongs
// on LINE for any agent; the Traditional pass is per-agent opt-in.
export const normalizeReplyText = (
  text: string,
  opts: { traditional: boolean },
): string => {
  const plain = stripMarkdown(text);
  return opts.traditional ? normalizeTraditional(plain) : plain;
};
