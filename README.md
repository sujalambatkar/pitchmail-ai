# PitchMail AI

A cold email personalizer for freelancers and SDRs. Paste what you offer and a prospect's LinkedIn profile text, pick a tone, and get a personalized subject line, email body, and follow-up email — streamed in real time.

## Features

- Single-page UI, no routing or auth required
- Streams the AI response token-by-token using the Vercel AI SDK
- Splits the streamed output live into three sections: subject, email body, and follow-up
- Three tone presets: Professional, Friendly, Direct
- Per-card copy-to-clipboard buttons
- Skeleton loading states while generating
- Daily generation counter persisted in localStorage
- Session limit (5 generations) with an upgrade banner

## Tech Stack

- Next.js 14 (App Router, fullstack in a single repo)
- Tailwind CSS
- Vercel AI SDK (`ai`, `@ai-sdk/react`, `@ai-sdk/groq`)
- Groq API running `llama-3.3-70b-versatile`
- TypeScript
- No database, no authentication

## System Architecture

```
                     +---------------------------------------------+
                     |                  Browser                     |
                     |                                               |
                     |  app/page.tsx                                 |
                     |  - Input form (offer, LinkedIn text, tone)    |
                     |  - useCompletion() from @ai-sdk/react         |
                     |  - Live stream parser (splits on "---")       |
                     |  - localStorage: daily generation counter     |
                     +---------------------------------------------+
                                       |
                                       | POST /api/generate
                                       | { offer, linkedinText, tone }
                                       v
                     +---------------------------------------------+
                     |        Next.js Route Handler (server)        |
                     |        app/api/generate/route.ts              |
                     |                                               |
                     |  1. Validate request body (400 if invalid)    |
                     |  2. Build prompt via lib/prompts.ts           |
                     |  3. Call streamText() with Groq provider      |
                     |  4. Return streaming response                 |
                     +---------------------------------------------+
                                       |
                                       | Streamed completion
                                       v
                     +---------------------------------------------+
                     |               Groq API                       |
                     |        model: llama-3.3-70b-versatile         |
                     |                                               |
                     |  Output format:                               |
                     |    SUBJECT: ...                               |
                     |    ---                                        |
                     |    EMAIL: ...                                 |
                     |    ---                                        |
                     |    FOLLOWUP: ...                              |
                     +---------------------------------------------+
```

### Request flow

1. The user fills in the offer and LinkedIn text and selects a tone in `app/page.tsx`.
2. On clicking Generate, `useCompletion` sends a POST request to `/api/generate`.
3. The route handler in `app/api/generate/route.ts` validates the payload and rejects incomplete or malformed requests with a 400 response.
4. `lib/prompts.ts` builds the system and user prompts, instructing the model to extract details from the LinkedIn text and return a strictly formatted response (subject, email, follow-up separated by `---`).
5. The route calls `streamText` from the Vercel AI SDK using the Groq provider and streams the response back to the client as it is generated.
6. On the client, the streamed text is parsed in real time: text before the first `---` populates the subject card, text between the first and second `---` populates the email card, and text after the second `---` populates the follow-up card.
7. Each card shows a shimmer skeleton until its section starts streaming in, and exposes a Copy button to copy just that section.
8. After a successful generation, the session counter increments (capped at 5 per session, after which the generate button is disabled and an upgrade banner is shown) and the daily counter in localStorage is updated.

## Project Structure

```
app/
  page.tsx               Single-page UI: form, tone selector, output cards
  layout.tsx             Root layout, font setup
  globals.css            Tailwind base styles and custom utilities
  api/
    generate/route.ts    Streaming API endpoint that calls Groq
lib/
  prompts.ts             System prompt and user prompt builder
.env.local.example       Template for required environment variables
```

## Getting Started

### Prerequisites

- Node.js 18 or later
- A Groq API key from https://console.groq.com/keys

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

Request body:

```json
{
  "offer": "I build AI chatbots for SaaS companies",
  "linkedinText": "Jane Doe, VP of Sales at Acme Corp...",
  "tone": "Professional"
}
```

`tone` must be one of `Professional`, `Friendly`, or `Direct`.

Responses:

- `200` - streamed text response in the format `SUBJECT: ... --- EMAIL: ... --- FOLLOWUP: ...`
- `400` - missing or invalid fields
- `500` - server misconfiguration (for example, missing `GROQ_API_KEY`)

## Privacy

No data is persisted on the server. Form inputs are sent directly to the Groq API for generation and are not stored. The only client-side persistence is a daily generation counter kept in localStorage for display purposes.

## License

MIT
