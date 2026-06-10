# PitchMail AI

A cold email engine built specifically for Indian freelancers and agencies pitching clients in the US and Europe. Paste what you offer and a prospect's LinkedIn profile text, pick a tone, and get personalized cold emails tuned for the India-to-US dynamic: credibility-first copy, natural US business English, and timezone-aware positioning.

## Features

- Single email mode: personalized subject lines, email body, and follow-up, streamed token-by-token
- A/B subject line variants: every generation produces three subject lines taking different angles, each with an AI-estimated open rate (clearly labeled as an estimate, not real send data)
- Bulk CSV mode: upload a CSV of up to 50 LinkedIn profiles, generate personalized emails for each with live per-row progress, and download the results as a CSV
- Reply analyzer: paste a prospect's reply, get a sentiment read (Positive / Neutral / Objection / Rejection) and a ready-to-send response drafted for you
- HubSpot import: paste a HubSpot private app token to pull contacts directly into the form (token stays in your browser, proxied per-request, never stored server-side)
- Niche-tuned prompts: counters offshore-quality skepticism with specificity instead of defensiveness, avoids Indian-English formalisms, mentions timezone overlap only when it strengthens the pitch
- Three tone presets: Professional, Friendly, Direct
- Per-card and per-variant copy-to-clipboard buttons
- Skeleton loading states and live stream parsing
- Daily generation counter persisted in localStorage
- Session limit (5 generations) with an upgrade banner (Pro coming soon at Rs. 499/mo)

## Tech Stack

- Next.js 14 (App Router, fullstack in a single repo)
- Tailwind CSS
- Vercel AI SDK (`ai`, `@ai-sdk/react`, `@ai-sdk/groq`)
- Groq API running `llama-3.3-70b-versatile`
- TypeScript
- No database, no authentication

## System Architecture

```
                  +-----------------------------------------------------+
                  |                      Browser                         |
                  |                                                       |
                  |  app/page.tsx — three workspaces (kept mounted):      |
                  |                                                       |
                  |  [Single]          [Bulk CSV]         [Reply]         |
                  |  useCompletion     client-side        useCompletion   |
                  |  streams from      worker pool (2     streams from    |
                  |  /api/generate     concurrent) calls  /api/reply      |
                  |                    /api/bulk per row                  |
                  |                                                       |
                  |  lib/parse.ts — shared stream/section parsers         |
                  |  lib/csv.ts — CSV parse + serialize (RFC-4180-ish)    |
                  |  localStorage — daily counter, HubSpot token          |
                  +-----------------------------------------------------+
                       |              |               |            |
                       v              v               v            v
            +----------------+ +-------------+ +-------------+ +------------------+
            | /api/generate  | | /api/bulk   | | /api/reply  | | /api/crm/hubspot |
            | streamText,    | | generateText| | streamText, | | CORS proxy to    |
            | returns data   | | returns     | | returns data| | HubSpot contacts |
            | stream         | | parsed JSON | | stream      | | API (token pass- |
            +----------------+ +-------------+ +-------------+ | through, never   |
                       |              |               |        | stored)          |
                       v              v               v        +------------------+
                  +-----------------------------------------+         |
                  |               Groq API                  |         v
                  |      model: llama-3.3-70b-versatile      |  +---------------+
                  |                                          |  | HubSpot CRM   |
                  |  Generation format:    Reply format:     |  | /crm/v3/      |
                  |    SUBJECTS:             SENTIMENT: ...  |  | objects/      |
                  |    1. ... | 54%          ---             |  | contacts      |
                  |    2. ... | 47%          RESPONSE: ...   |  +---------------+
                  |    3. ... | 41%                          |
                  |    ---                                   |
                  |    EMAIL: ...                            |
                  |    ---                                   |
                  |    FOLLOWUP: ...                         |
                  +-----------------------------------------+
```

### Request flows

Single email:

1. The user fills in the offer and LinkedIn text (typed, or imported from HubSpot) and selects a tone.
2. `useCompletion` POSTs to `/api/generate`, which validates the payload, builds the niche-tuned prompt from `lib/prompts.ts`, and streams the Groq response back.
3. The client parses the stream live: the SUBJECTS section renders as three A/B/C variant rows with estimated open rates (best variant highlighted), the EMAIL section fills the body card, and the FOLLOWUP section fills the follow-up card.

Bulk CSV:

1. The user uploads a CSV (`name`, `linkedin_text` columns; header detection is flexible and a template is downloadable). Rows are parsed client-side by `lib/csv.ts` and capped at 50.
2. A pool of two concurrent workers POSTs each row to `/api/bulk`, which generates non-streaming via `generateText`, parses the model output server-side, and returns `{ subjects, email, followup }` as JSON. Two workers keeps throughput reasonable without tripping Groq rate limits.
3. Each row shows live status (pending / working / done / failed); failed rows are retried on re-run. Results download as a CSV with the best subject variant, email, follow-up, and per-row status.

Reply analyzer:

1. The user pastes the prospect's reply (and optionally the original email) and picks a tone.
2. `useCompletion` POSTs to `/api/reply`, which streams a sentiment classification (Positive / Neutral / Objection / Rejection) plus a one-line reading, then a drafted response, parsed live into two cards.

HubSpot import:

1. The user pastes a HubSpot private app token (needs the `crm.objects.contacts.read` scope). The token is kept in localStorage only.
2. `/api/crm/hubspot` proxies the request to HubSpot's contacts API (the browser cannot call HubSpot directly due to CORS), passing the token through without storing it, and returns a simplified contact list.
3. Clicking a contact composes its name, title, company, and email into the profile textarea.

## Project Structure

```
app/
  page.tsx                   Single-page UI: mode switcher + three workspaces
  layout.tsx                 Root layout, font setup
  globals.css                Tailwind base styles and custom utilities
  api/
    generate/route.ts        Streaming endpoint for single email mode
    bulk/route.ts            Non-streaming JSON endpoint, one bulk row per call
    reply/route.ts           Streaming endpoint for the reply analyzer
    crm/hubspot/route.ts     CORS proxy for HubSpot contact import
lib/
  prompts.ts                 Niche-tuned system prompts and prompt builders
  parse.ts                   Shared parsers for streamed/complete model output
  csv.ts                     Minimal CSV parser and serializer
.env.local.example           Template for required environment variables
```

## Getting Started

### Prerequisites

- Node.js 18 or later
- A Groq API key from https://console.groq.com/keys
- Optional: a HubSpot private app token with the `crm.objects.contacts.read` scope, for contact import

### Setup

```bash
npm install
cp .env.local.example .env.local
```

Edit `.env.local` and add your key:

```
GROQ_API_KEY=gsk_your_key_here
```

### Run

```bash
npm run dev
```

Open http://localhost:3000 in your browser. If port 3000 is already in use, Next.js will automatically use the next available port — check the terminal output for the URL.

## API

### POST /api/generate

Streams a single email generation.

```json
{
  "offer": "I build AI chatbots for SaaS companies",
  "linkedinText": "Jane Doe, VP of Sales at Acme Corp...",
  "tone": "Professional"
}
```

Streamed response format: `SUBJECTS: 1. ... | 54% ... --- EMAIL: ... --- FOLLOWUP: ...`

### POST /api/bulk

Generates one bulk row, non-streaming. Same request body as `/api/generate`.

Response:

```json
{
  "subjects": [{ "text": "...", "score": 54 }],
  "email": "...",
  "followup": "..."
}
```

### POST /api/reply

Streams a reply analysis.

```json
{
  "originalEmail": "optional — the email you sent",
  "replyText": "their reply",
  "tone": "Professional"
}
```

Streamed response format: `SENTIMENT: Objection — ... --- RESPONSE: ...`

### POST /api/crm/hubspot

Proxies a contact list fetch. The token is passed through to HubSpot and never persisted.

```json
{ "token": "pat-na1-..." }
```

Response: `{ "contacts": [{ "id", "name", "title", "company", "email" }] }`

All endpoints return `400` for missing or invalid fields and `500` for server misconfiguration (for example, a missing `GROQ_API_KEY`). `/api/bulk` returns `502` if the model output cannot be parsed, and `/api/crm/hubspot` returns `401` if HubSpot rejects the token.

## Privacy

No data is persisted on the server. Form inputs, CSV rows, and prospect replies are sent directly to the Groq API for generation and are not stored. The HubSpot token lives only in the browser's localStorage and is passed through per-request. The only other client-side persistence is a daily generation counter kept in localStorage for display purposes.

## License

MIT
