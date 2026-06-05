// The account target: fermion as fermi's front door. Unlike the agent /
// bot targets it isn't bound to an existing resource — it's scoped to the
// owner and its job is to get them set up (connect a LINE bot, point them
// at the next step). Its one tool only *summons UI*; credentials never
// pass through the LLM (see start_line_connect).

import type { SupabaseClient } from '@supabase/supabase-js';
import type { ToolSchema, Toolset } from '../agent/tools/index.ts';
import type { FermionTarget } from './registry.ts';

const schemas: ToolSchema[] = [
  {
    type: 'function',
    function: {
      name: 'start_line_connect',
      description:
        'Show the owner a secure form to connect their LINE bot. Call this once they say they have their Channel Secret and Access Token ready. The form collects and stores the credentials directly — NEVER ask the owner to type a secret or token into the chat.',
      parameters: { type: 'object', properties: {}, required: [], additionalProperties: false },
    },
  },
];

// Account-level connectors the owner manages on the Connectors page,
// with what each is for. `keyType` matches the stored credential so
// "connected?" is just a presence check.
const CONNECTORS: ReadonlyArray<{ keyType: string; name: string; purpose: string; required: boolean }> = [
  { keyType: 'openrouter', name: 'OpenRouter', purpose: 'the AI provider that powers text replies', required: true },
  { keyType: 'openai',     name: 'OpenAI',     purpose: 'your own key for voice (text-to-speech / speech-to-text)', required: false },
  { keyType: 'fal',        name: 'fal',        purpose: 'your own key for image generation', required: false },
  { keyType: 'tavily',     name: 'Tavily',     purpose: 'your own key for the web-search capability', required: false },
  { keyType: 'github',     name: 'GitHub',     purpose: 'authorizes the GitHub capability', required: false },
];

interface AccountState {
  bots:      Array<{ name: string }>;
  connected: Set<string>;
}

const accountSystemPrompt = (state: AccountState): string =>
  `You are fermion, fermi's assistant — the first thing the owner sees when they open fermi. You help a non-technical person get their LINE assistant running by talking with them.

A LINE "bot" is their connected LINE Official Account; an "agent" is the persona that answers on it. Here is where this account stands:
- Connected bots: ${state.bots.length ? state.bots.map(b => b.name).join(', ') : '(none yet)'}

Connectors (managed on the Connectors page). OpenRouter is required for replies; the others are optional and only needed if the owner wants to use their own key / that feature. Voice, image, and search otherwise run on fermi's included credits.
${CONNECTORS.map(c => `- ${c.name}${c.required ? ' (required)' : ''} — ${c.purpose}: ${state.connected.has(c.keyType) ? 'connected' : 'not connected'}`).join('\n')}

How to help:
- If they have no bot, the first step is connecting one. Tell them to open the LINE Developers Console, create a Messaging API channel, and have its Channel Secret and Access Token ready. When they say they're ready, call start_line_connect to bring up a secure form. Do NOT ask them to paste the secret or token into this chat — the form handles that safely.
- Once a bot is connected, if OpenRouter isn't connected yet, that's the next step: point them to Connectors → OpenRouter (a one-click sign-in). Replies won't work until it's connected.
- After both are set, help them shape what the assistant says — that's configured on the agent's page.
- Answer "how do I start" / "what now" by naming the single next step, not the whole checklist at once.
- Reply in the user's language. Be warm and concise. Don't dump jargon.`;

const buildAccountToolset = (): Toolset => ({
  schemas,
  // start_line_connect has no server effect — it's a directive the chat UI
  // renders as the connect form. Acknowledging it lets the model continue.
  execute: (name: string): Promise<string> =>
    Promise.resolve(
      name === 'start_line_connect'
        ? JSON.stringify({ ok: true })
        : JSON.stringify({ error: `Unknown tool: ${name}` }),
    ),
});

export const accountTarget: FermionTarget = {
  // Connecting happens through /api/bots (via the form), not through the
  // loop, so nothing the loop does counts as a resource mutation.
  mutatingTools: [],
  // `id` is the owner's user id (the route forwards the authenticated user
  // since an account has no separate resource id).
  resolve: async (admin, id) => {
    const { data: bots, error: botErr } = await admin
      .from('bots')
      .select('display_name')
      .eq('owner_id', id)
      .is('deleted_at', null);
    if (botErr) throw botErr;

    // Account-level connectors the owner has connected (bot_id null
    // excludes per-bot LINE credentials). Presence is all we need.
    const { data: creds, error: credErr } = await admin
      .from('encrypted_credentials')
      .select('key_type')
      .eq('user_id', id)
      .is('bot_id', null);
    if (credErr) throw credErr;

    return {
      ownerId: id,
      systemPrompt: accountSystemPrompt({
        bots:      (bots ?? []).map(b => ({ name: b.display_name ?? '(unnamed)' })),
        connected: new Set((creds ?? []).map(c => c.key_type as string)),
      }),
      toolset: buildAccountToolset(),
    };
  },
};
