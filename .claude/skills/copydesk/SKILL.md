---
name: copydesk
description: >-
  Write or review fermi product copy in the house voice. Covers dashboard UI
  strings (headers, descriptions, helper text, empty/error states, toasts),
  LLM-facing capability/tool descriptions, and marketing + transactional email.
  Use when writing new copy, auditing a page or component for off-voice
  strings, or making copy sound more like fermi / more human / less generic-AI.
---

# copydesk

fermi's copy desk. Two jobs: **write** new copy in the house voice, and
**review** existing copy for strings that drifted off it. A copy desk does
both, so does this.

The voice is not "tasteful" as an adjective you aim at. It is the concrete
rules and the example bank below. When in doubt, copy the cadence of a real
fermi line, not your instinct for how SaaS usually sounds.

## The voice (north star)

fermi sounds like a sharp engineer explaining their own product to a peer:
short, concrete, confident, friction-aware. It states the *function* of a
thing before its label, kills objections before they're raised, and stays
calm when things break. It never hypes, never pads, never sounds like it was
generated.

## Two modes

**Write.** Given a surface and intent, produce the copy plus one line on why
it's shaped that way. Pick the register first (below), then the surface's
length budget from the playbook, then write.

**Review.** Given a file, component, or diff, scan every user- or model-facing
string. For each off-voice string, report `file:line` → which principle it
breaks → a proposed rewrite. Don't rewrite silently; show the before.

## Registers (pick one first)

The three surfaces fermi ships are three different jobs with non-overlapping
rules. Identify the register before writing a word.

### A. Product UI (dashboard)

Reader: a logged-in user mid-task. Font is Inter, **sentence case**.

- Lead with the function, not a label: a section subhead says what the section
  *is for*, not what it's called.
- Short sentences and fragments. Comma-chained clauses for rhythm.
- Kill friction inline: cost, time, "no credit card", "fermi takes no cut".
- Empty and error states stay calm and always offer the next step.
- Sentence case for everything. Not Title Case. Not all-lowercase (that's the
  marketing register, below).

Gold standard (all real, from `app/pages/dashboard/`):

| Surface | Line |
|---|---|
| Section subhead | `Where every message goes for a response.` |
| Card description | `Every message routes through OpenRouter. Pick from Claude, GPT, Gemini, or 200+ other models. Pay OpenRouter as you go, no minimum, fermi takes no cut.` |
| Helper | `New to OpenRouter? Free signup, takes a minute.` |
| Helper | `Grab a key at app.tavily.com. 30 seconds, free, no credit card.` |
| Status | `No setup needed` · `No credential needed` · `Coming soon` |
| Empty state | title `Capability not found` + body `This page may have been removed, or the link is wrong.` + action `Back to Connectors` |
| Toast | `{name} attached` · `Attach failed` · `Tavily connected` |

### B. Marketing & landing (+ transactional email)

Reader: a stranger deciding whether to care. Font is JetBrains Mono,
**all-lowercase**, terminal/scientific aesthetic.

- Lowercase throughout, including `fermi` and CTAs (`join wait-list`,
  `sign in`). SEO `<meta>` is the one exception: sentence case there.
- Benefit-led but understated. State what changes for the user, don't sell it.
- Lean on the **brand motifs** (fermi = Enrico Fermi):
  - Fermi paradox: `"where is everyone?" — enrico fermi, 1950` → `they're on LINE.`
  - Fermi estimation: back-of-envelope stats as hero metrics —
    `t ≈ 5 min` (onboarding) · `n = 10² MCPs` (ecosystem) · `d = 0 deploys`.
- Glyphs are part of the voice here: `·` `→` `↗` `∴` `!`. Use sparingly.

Gold standard (real, from `app/pages/index.vue`):

| Surface | Line |
|---|---|
| Hero | `agentic AI, in the chat you already use.` |
| Subhead | `fermi puts MCP-connected agents inside LINE. No deploy, no new app to learn.` |
| Status pill | `closed beta · accepting wait-list` |
| Reassurance | `no spam. we ping you the moment beta opens.` |
| Success | `you're on the list. we'll write to {email}.` |
| Inline error | `enter a valid email address` |

Transactional email follows this register's lowercase calm, minus the landing
page's glyph play: short subject, one job per mail, plain sign-off.

### C. LLM-facing tool / capability descriptions

Reader: **the model**, deciding whether to invoke a tool. Not a human. This is
prompt engineering, not microcopy.

- Write **when to use**, not what it does. The model already infers mechanics
  from the name and schema; it needs the trigger condition.
- Open with the action verb, then the decision cue, then a concrete example.
- Capability *names* are nouns (an integration, not an action): `Web search`,
  `Notion`. Provider name when one provider dominates (`github`, `notion`);
  domain name when providers are swappable (`web-search` could be Tavily or
  Brave).

Gold standard (real, from the capabilities seed):

| Capability | Description |
|---|---|
| web-fetch | `Fetch and return the text contents of a specific URL. Use after web-search returns a promising link, or when the user supplies a URL directly.` |
| web-search | `Search the web for current information beyond the model's training cutoff. Returns ranked titles, snippets, and URLs.` |

## Operating principles

Each is a rule plus a real before/after. The ✗ side is invented to show the
failure; the ✓ side is a real fermi line.

1. **Function before label.** Say what it's for.
   - ✗ `Configure your model provider settings.`
   - ✓ `Where every message goes for a response.`

2. **Kill the objection in the same breath.** Name cost/time/effort up front.
   - ✗ `Connect your Tavily account to enable web search.`
   - ✓ `Grab a key at app.tavily.com. 30 seconds, free, no credit card.`

3. **Concrete over abstract.** Real names, real numbers, no "powerful range".
   - ✗ `Access a wide range of leading AI models.`
   - ✓ `Pick from Claude, GPT, Gemini, or 200+ other models.`

4. **Short. Fragments are fine. Commas carry rhythm.**
   - ✓ `Pay OpenRouter as you go, no minimum, fermi takes no cut.`

5. **Errors and empty states stay calm and give an exit.** No "Oops!", no
   blame, always a next step.
   - ✗ `Error: the requested capability could not be found.`
   - ✓ `This page may have been removed, or the link is wrong.` + `Back to Connectors`

6. **Right register, right case.** Dashboard = sentence case. Marketing =
   lowercase mono. Never mix them on one surface.

7. **LLM-facing copy answers "when", human-facing copy answers "why I care".**
   Never write a tool description like a marketing blurb, or a section subhead
   like a function signature.

## Surface playbook

Look up the surface, write to its budget.

| Surface | Register | Job | Budget |
|---|---|---|---|
| Page H1 | UI | Name the page | 1–3 words |
| Section subhead | UI | What this section is *for* | ≤ 1 short sentence |
| Card description | UI | What it does + the catch removed | 1–3 sentences |
| Helper text | UI | Lower the barrier to the next click | ≤ 1 sentence |
| Status label | UI | State in 2–3 words | 2–3 words |
| Empty state | UI | Why empty + the way out | title + 1 line + action |
| Error / toast | UI | What happened, calmly | ≤ 1 short clause |
| Landing hero | Mktg | The one idea, lowercase | ≤ 8 words |
| Landing subhead | Mktg | How it works in plain terms | 1–2 sentences |
| Hero metric | Mktg | Fermi-estimate stat + label | `x = n unit` |
| Wait-list / CTA | Mktg | Lowercase verb phrase + reassurance | button + 1 line |
| Email subject | Mktg | One job, lowercase | ≤ 6 words |
| Tool description | LLM | When to invoke + example | 1–2 sentences |

## Lexicon (fixed terms)

Same concept, same word, every time. Inconsistency is most of what makes copy
feel unpolished.

- **fermi** — always lowercase, even sentence-initial.
- **Connect / Disconnect** — attaching a credential to the account (OpenRouter,
  Tavily). Never "link/unlink", "add/remove" for credentials.
- **Attach / Detach** — wiring a capability to a specific agent. Distinct from
  Connect; don't swap them.
- **Capability** — a tool an agent can reach for (web search, Notion). Not
  "integration", "plugin", "skill".
- **Connector** — a stored credential. The Connectors page holds these.
- **Agent** — the configured bot. **provider** — an LLM/credential source
  (OpenRouter, a model vendor). Don't call a provider an "agent".
- **agentic** — fine in marketing; don't gloss it in UI.

## AI-tell blocklist

These are the tells that copy was machine-generated. Ban on sight; this list is
how the "human feel" is enforced.

- Hype adjectives: `powerful`, `robust`, `seamless` / `seamlessly`,
  `effortless`, `cutting-edge`, `next-level`, `game-changing`, `revolutionary`.
- Empty verbs: `unlock`, `elevate`, `supercharge`, `leverage`, `empower`,
  `streamline`, `harness`.
- Filler openers: `In today's fast-paced world`, `Whether you're … or …`,
  `Say goodbye to …`, `Look no further`.
- Title Case Headings In The Dashboard (sentence case there).
- Exclamation-mark hype (`Done!`, `Success!`) — fermi states, doesn't cheer.
- Emoji as bullets or decoration.
- **Em dash (`—`)** — fermi avoids it. Use a period, comma, parens, or colon.
  (A few legacy instances exist, e.g. the `index.vue` hero subhead and the
  time-capability seed; review mode should flag them.)
- Hedging: `simply`, `just`, `easily` (if it were easy you wouldn't say so).

## Pre-ship checklist

Before declaring copy done:

- [ ] Right register, right case for the surface.
- [ ] No AI-tell from the blocklist.
- [ ] No em dash.
- [ ] Lexicon terms used consistently.
- [ ] Within the surface's length budget.
- [ ] Error/empty states offer a next step.
- [ ] LLM-facing strings say *when to use*, not *what it does*.
- [ ] Reads like a real fermi line in the example bank, not generic SaaS.

## Review procedure

1. Identify each user- or model-facing string in the target (template text,
   `placeholder`, `title`, `label`, `description`, toast args, seed copy).
2. Tag each with its register.
3. For each off-voice string, output one row:
   `path:line` — quoted string — principle broken — proposed rewrite.
4. Skip strings that are already on-voice; don't churn good copy.
5. End with a one-line verdict: on-voice, or N strings to fix.
