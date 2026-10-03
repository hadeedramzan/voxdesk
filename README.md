# VoxDesk

A browser-based voice support agent. Ask about a support ticket or a general support question by speaking or typing, and the agent answers from a database and a FAQ list instead of guessing. Answers can be read aloud.

**Live demo:** https://voxdesk-eta.vercel.app/
**Source:** https://github.com/hadeedramzan/voxdesk

![VoxDesk chat](docs/screenshot.png)

Try tickets 1042 to 1046. Ticket 9999 does not exist, and the agent should say so instead of inventing an answer. The tickets and FAQs are sample data.

## What it does

- Voice input with the browser speech recognition API (Chrome and Edge), plus a text box and suggestion buttons
- An LLM chooses between three tools:
  - `get_ticket_status` reads a ticket from a read-only Postgres table
  - `lookup_faq` finds answers in a small FAQ list
  - `request_human_handoff` logs a handoff request in a database table
- Ticket answers include a status card (number, subject, team, status badge, last update) built from the database row, not from the model's text
- Every answer shows its source (ticket or FAQ) and the measured response time
- If a ticket or answer is not found, the agent says so instead of guessing
- Replies are read aloud when the question was asked by voice, with a Stop button

## Stack

- **Frontend:** React 18, Vite, Tailwind CSS
- **AI:** Groq API, model `openai/gpt-oss-120b`, using tool (function) calling
- **Database:** Supabase (Postgres) with row level security: `tickets` is read-only, `handoffs` is insert-only
- **Speech:** Web Speech API for recognition and synthesis, no paid speech services
- **Hosting:** Vercel (static frontend plus one serverless function)

## How it works

```text
Mic / text --> React app --> POST /api/agent (Vercel function)
                                  |
                                  |  1. send conversation + tool definitions to Groq
                                  |  2. model asks for a tool call
                                  |  3. function runs it (Supabase read, FAQ lookup or handoff insert)
                                  |  4. result goes back to the model
                                  v
                    reply + ticket data + sources --> shown and read aloud
```

The Groq key and the Supabase key stay in the serverless function, so neither reaches the browser.

## Run locally

You need a free Supabase project and a free Groq API key.

1. Run `schema.sql` and `handoffs.sql` in the Supabase SQL editor.
2. Copy `.env.example` to `.env` and fill in the values.
3. Install dependencies with `npm install`.

The agent endpoint is a Vercel function, so run the whole app with the Vercel CLI (`vercel dev`). `npm run dev` alone serves the page but not `/api/agent`.

## Deploy

1. Push the repo to GitHub and import it in Vercel.
2. Add these environment variables before deploying: `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `GROQ_API_KEY`. Do not prefix them with `VITE_`.

## Measured response time

In my own testing, replies took roughly 1.5 to 2.3 seconds from sending the question to showing the answer. That includes the network, the LLM and the database lookup, so it is not a real-time phone experience.

## Known limits

This is a demo, not a production support system.

- Sample tickets and FAQs only. A handoff request is logged, but no human is contacted
- Not a phone system: no calls, no live transfer, no paid speech services
- Speech recognition depends on the browser (Chrome and Edge) and can mishear. Spoken digits such as "one zero four two" are converted to numbers, but phrases like "ten forty two" are not
- The model sometimes returns the same sentence twice, so the server removes near-duplicate sentences from replies
- No authentication and no rate limiting, so the AI endpoint is bounded only by the Groq free tier
- Replies use the browser's default voice, which differs by device
- Conversation history lives in the page only and resets on refresh
