# fermi

A self-hostable, chat-based LINE assistant that **sets itself up — and fixes itself — by talking to you.** Built on Supabase, powered by your own LLM through OpenRouter.

fermi is a reference implementation, not a product. The part worth copying isn't a clever prompt — it's the integration: how a LINE webhook, an LLM agent loop, and Postgres fit together so a chat bot is reliable, manageable, and runs entirely on your own keys.

## What makes it different

The agent isn't just something you talk to — it manages the whole integration from inside the conversation.

- **It sets itself up by chat.** Tell the assistant you want to connect a LINE bot and it walks you through it: a secure form to paste your channel credentials, a one-click connect for your OpenRouter key, and it verifies the webhook on LINE for you over the Messaging API — you never touch the LINE console. From there it shapes its own persona, voice, models, and capabilities, all in the chat.
- **It heals itself.** When a reply doesn't land, drop the agent into debug mode and it reads its own recent runs — the step-by-step trace of every model call and tool result — works out what broke, and fixes the configuration. The same management tools work from inside LINE once you've claimed the bot as its owner.
- **It extends itself with capabilities.** Tools the model chooses to call mid-conversation: web search, web fetch, image generation, a per-agent knowledge base (pgvector RAG), reminders, and any MCP server you point it at.
- **It runs on your keys.** Bring your own OpenRouter — and optionally OpenAI for voice, fal for images, Tavily for search. No tiers, no metering, no accounts to manage: you self-host, and you pay your providers directly.

## How it's built

This is where the reference-implementation value is — the choices that aren't obvious until you've shipped a LINE bot.

- **The webhook can't do the work.** On a serverless host, the LINE webhook handler is frozen the instant it returns `200`, so you cannot fire-and-forget the LLM call there — the runtime suspends before it finishes. fermi acknowledges immediately, enqueues the event in Postgres (`pgmq`), and a `pg_net` call from the always-on database drives a Deno edge worker that does the real work. It's reliable, and it drains in seconds.
- **The agent loop.** The worker runs an OpenRouter tool-calling loop — model → tool calls → tool results → model — until it has a reply. Capabilities plug in as tools; the master's management and debug overlays are just more tools layered on top.
- **Reply within LINE's budget, fall back to push.** A LINE reply token is only good for about 25 seconds. fermi tracks that budget mid-run and switches to the Push API for longer turns, so a slow answer still arrives instead of timing out.
- **Keys stay encrypted.** Provider credentials are KEK-wrapped per owner. At call time the worker resolves the owner's connected key first, then an environment fallback — so the same code path serves a fully self-hosted deploy and a bring-your-own-key one.

## Architecture

```
  LINE  ──webhook──▶  Nitro handler  ──enqueue──▶  Postgres
 (user)              (ACK 200 fast)              (pgmq queue)
    ▲                                                 │
    │                                          pg_net │  (always-on DB
    │ Reply / Push                                    ▼   drives the worker)
    │                                          Deno edge worker
    └─────────────  reply  ──────────────────  ┌──────────────────┐
                                               │   agent loop  ◀──┼──▶  OpenRouter
                                               │   capabilities   │     (any model)
                                               └────────┬─────────┘
                                                        │
                         Supabase Postgres  ◀───────────┘
             (threads · runs · encrypted creds · pgvector)
                                ▲
                                │
           Nuxt dashboard  ─────┘   the in-dashboard agent chat (agent-invoke)
           (Auth · config)         drives the same management + debug tools
```

## Tech stack

- **Dashboard** — Nuxt 4, Nuxt UI, Tailwind v4, i18n (English / 繁體中文)
- **Backend** — Supabase: Postgres, Auth, Edge Functions (Deno), Storage, `pgmq`, `pg_cron`, `pg_net`, `pgvector`
- **LLM** — OpenRouter (any model); OpenAI for voice (speech-to-text / text-to-speech)
- **Messaging** — LINE Messaging API (`@line/bot-sdk`)
- **Validation** — Zod, end to end

## Run it yourself

You'll need a [Supabase](https://supabase.com) project, a [LINE Official Account](https://developers.line.biz) with a Messaging API channel, and an [OpenRouter](https://openrouter.ai) key.

```bash
pnpm install

# Apply the schema to your linked Supabase project
supabase link --project-ref <your-ref>
supabase db reset

# Deploy the workers
supabase functions deploy agent agent-invoke

# Run the dashboard
pnpm dev
```

Set these where each side reads them — dashboard env for Nuxt, function secrets for the workers:

| Variable | Used for |
|---|---|
| `FERMI_KEK` | Master key that wraps stored provider credentials |
| `SUPABASE_URL`, `SUPABASE_SECRET_KEY` | Service-role access from the server and worker |
| `FERMI_INTERNAL_SECRET` | Authenticates the dashboard → worker call |
| `SITE_URL` | Your dashboard's public URL (used in LINE notices) |
| `PLATFORM_OPENROUTER_KEY` | Optional env fallback when an owner hasn't connected their own |
| `UPSTASH_REDIS_REST_URL` / `_TOKEN` | Optional — rate limiting (Postgres is the fallback) |
| `FAL_API_KEY`, `TAVILY_API_KEY`, `OPENAI_API_KEY` | Optional env fallbacks for image / search / voice |

Then sign in to the dashboard and just tell the assistant you want to connect a bot — it takes you the rest of the way.

## What it can do

1:1 and group chat · voice in and out · image generation · web search and fetch · a per-agent knowledge base · scheduled reminders · and full management from inside LINE once you own the bot.

## License

[FSL-1.1-MIT](LICENSE) — the Functional Source License. Free for any purpose except building a competing product, and it converts to the MIT License two years after each release.
