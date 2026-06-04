---
name: copydesk
description: >-
  Write or review fermi product copy in the house voice. Covers dashboard UI
  strings (headers, descriptions, helper text, empty/error states, toasts),
  LLM-facing capability/tool descriptions, marketing + transactional email,
  and zh-Hant localization. Use when writing new copy, auditing a page or
  component for off-voice strings, translating UI into zh-Hant, or making copy
  sound more like fermi / more human / less generic-AI.
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
- **Orienting copy can be warm; instructing copy stays terse.** An
  *instructing/functional* line names a mechanism — keep it clipped. An
  *orienting* line welcomes the user to a page and says what lives here — it may
  use a plain, second-person spoken cadence. This matters most in **zh-Hant**:
  the terse-fragment style reads colder in Chinese than in English, so don't
  translate an English noun-phrase subhead flatly; let an orienting zh line
  breathe. Warm ≠ hype: still no exclamation, no AI-tell.
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
  `GitHub`. Provider name when one provider dominates (`github`,
  `twinkle-hub`); domain name when providers are swappable (`web-search`
  could be Tavily or Brave).

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

## zh-Hant localization

The UI ships zh-Hant + en only. Translating is not the default — the test is
**whether a clean, unambiguous, Taiwan-native term exists.**

- **Translate** when it does: Bot → 機器人, Capability → 能力, Connector →
  連接器, provider → 提供者. The user-facing persona field is **Persona →
  人物設定** — not "system prompt / 系統提示詞". That jargon stays in
  technical / LLM-facing contexts (the DB column, fermion's tools) only;
  fermion exists so a user never has to meet the term "system prompt".
- **Keep English** in two cases:
  - *Protocol / copy-paste identifiers* — `token`, `webhook`, `API key`. A
    translation won't match what the user sees in an external console.
  - *No clean zh-Hant term* — `Agent` (代理人 reads as insurance/real-estate;
    代理 collides with proxy; 智能體 is Simplified-register; 智慧體 is
    academic), `MCP`, `LLM`, `OpenRouter`.

Agent stays English because no good word exists, **not** because it's a core
product noun — Bot is just as core and *is* translated. Don't reach for the
"core noun" reasoning; reach for "is there a clean TW term".

TW-native usage:

- 用戶 → **使用者** (用戶 reads Mainland).
- Written noun lists take **與**, not the spoken 跟: `名稱、人物設定與預設模型`.
  Exception: in **warm orienting copy** (above), the softer **和** fits the
  spoken cadence better than 與 and is still written-register — `模型和能力`.
  Reach for 與 in formal enumerations, 和 in a sentence that talks to the user.
- A relative-time slot already carries its own tense suffix (dayjs renders
  `{time}` as `1 小時前`). Put the slot **first**, don't prefix a state verb:
  `{time}連接` ("1 小時前連接"), never `已連接 {time}` ("已連接 1 小時前", where
  the trailing 前 fights the leading 已).
- Latin acronyms inside CJK take **full-width parens**: （PAT）（UTC）, matching
  （預設） — not half-width `(PAT)`.

## Ellipsis (both languages)

Use `…` (U+2026). Never ASCII `...`. Never `⋯` (U+22EF is a *math* operator —
wrong codepoint, breaks a11y / search / copy). Never `……` (that's the Chinese
*prose* ellipsis; UI affordances don't use it).

Whether a placeholder carries `…` depends on the control:

- **Select / dropdown** — none. You pick from a fixed list, you don't keep
  typing: `選擇平台`, `Pick a platform`.
- **Search input / loading state** — `…`: `搜尋…`, `登入中…`, `Loading…`.
- **Free-text example placeholder** — case by case: `你是…助理…` (sentence
  continues) yes; `my agent` (complete example) no.

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
- ASCII `...` or `⋯` used as an ellipsis — use `…` (see **Ellipsis** above).
- Hedging: `simply`, `just`, `easily` (if it were easy you wouldn't say so).

## Pre-ship checklist

Before declaring copy done:

- [ ] Right register, right case for the surface.
- [ ] No AI-tell from the blocklist.
- [ ] No em dash. Ellipsis is `…`; selects carry none.
- [ ] Lexicon terms used consistently.
- [ ] zh-Hant: translated only where a clean TW term exists; identifiers / no-term stay English; 使用者 not 用戶.
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
