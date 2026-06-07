// Owner-level connect tools: summon the secure LINE form / OpenRouter
// sign-in widgets. No server effect, no id — the credentials / OAuth go
// through the dedicated secure paths, never the LLM. webOnly: both need a
// browser surface, so on LINE the toolset returns a dashboard pointer.

import type { ManagementTool } from './tool.ts';

// Account-level connectors the owner manages on the Connectors page.
// `keyType` matches the stored credential so "connected?" is a presence
// check (see state.ts). Reused by the system prompt.
export const CONNECTORS: ReadonlyArray<{ keyType: string; name: string; purpose: string; required: boolean }> = [
  { keyType: 'openrouter', name: 'OpenRouter',  purpose: 'the AI provider that powers text replies', required: true },
  { keyType: 'openai',     name: 'OpenAI',      purpose: 'your own key for voice (text-to-speech / speech-to-text)', required: false },
  { keyType: 'fal',        name: 'fal',         purpose: 'your own key for image generation', required: false },
  { keyType: 'tavily',     name: 'Tavily',      purpose: 'your own key for the web-search capability', required: false },
  { keyType: 'github',     name: 'GitHub',      purpose: 'authorizes the GitHub capability', required: false },
  { keyType: 'twinkle',    name: 'Twinkle Hub', purpose: 'your own key for the Twinkle Hub (Taiwan lookups) capability', required: false },
];

const widget = (kind: string): unknown => ({ ok: true, widget: kind });

export const connectTools: ManagementTool[] = [
  {
    schema: {
      type: 'function',
      function: {
        name: 'start_line_connect',
        description: 'Show a secure form to connect a LINE bot. Call this as soon as the owner wants to connect one — show the form upfront, before they fetch the credentials, so they fill it instead of pasting into the chat. The form stores the credentials directly — NEVER ask the owner to type a secret or token into the chat.',
        parameters: { type: 'object', properties: {}, required: [], additionalProperties: false },
      },
    },
    webOnly:  true,
    linkPath: () => '/dashboard/bots/new',
    run:      () => Promise.resolve(widget('line_connect')),
  },
  {
    schema: {
      type: 'function',
      function: {
        name: 'start_openrouter_connect',
        description: 'Show a "Connect OpenRouter" button. OpenRouter powers replies (required). It opens OpenRouter sign-in in a new tab and the connection is detected automatically. Call when OpenRouter isn\'t connected and the owner is ready.',
        parameters: { type: 'object', properties: {}, required: [], additionalProperties: false },
      },
    },
    webOnly:  true,
    linkPath: () => '/dashboard/connectors/openrouter',
    run:      () => Promise.resolve(widget('openrouter_connect')),
  },
];
