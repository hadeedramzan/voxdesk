# VoxDesk

A browser-based voice support agent. Ask about a support ticket by speaking or typing, and the agent looks the ticket up in a database and answers out loud.

**Live demo:** https://voxdesk-eta.vercel.app/
**Source:** https://github.com/hadeedramzan/voxdesk

![VoxDesk chat](docs/screenshot.png)

Try tickets 1042 to 1046. Ticket 9999 does not exist, and the agent should say so instead of inventing an answer.

## What it does

- Voice input through the browser speech recognition API (Chrome and Edge), plus a text box as a fallback
- An LLM decides when to call a tool, `get_ticket_status`, which reads the ticket from Postgres
- The reply is generated from the tool result only, then read aloud with the browser speech synthesis API
- If a ticket is not found, or no ticket number is given, the agent says so and asks instead of guessing

## Stack

- **Frontend:** React 18, Vite, Tailwind CSS
- **AI:** Groq API, model `openai/gpt-oss-120b`, using tool (function) calling
- **Database:** Supabase (Postgres), read-only access to a `tickets` table
- **Speech:** Web Speech API (recognition and synthesis), no paid speech services
- **Hosting:** Vercel (static frontend plus one serverless function)

## How it works

```text
Mic / text --> React app --> POST /api/agent (Vercel function)
                                  |
                                  |  1. send conversation + tool definition to Groq
                                  |  2. model asks for get_ticket_status(ticket_id)
                                  |  3. function reads the ticket from Supabase
                                  |  4. result goes back to the model
                                  v
                          short spoken-style reply --> shown and read aloud
```

Both the Groq key and the Supabase key stay in the serverless function, so neither reaches the browser.

## Run locally

You need a free Supabase project and a free Groq API key.

1. Run `schema.sql` in the Supabase SQL editor. It creates the `tickets` table and five sample tickets.
2. Copy `.env.example` to `.env` and fill in the values.
3. Install dependencies:

```bash
npm install
```

The agent endpoint is a Vercel function, so run the whole app with the Vercel CLI (`vercel dev`). `npm run dev` alone serves the page but not `/api/agent`.

## Deploy

1. Push the repo to GitHub and import it in Vercel.
2. Add these environment variables before deploying: `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `GROQ_API_KEY`. Do not prefix them with `VITE_`.

## Known limits

This is a demo, not a production support system.

- One tool only (ticket status lookup) on five sample tickets
- Not a phone system. There are no calls, no live transfer to a human, and no paid speech services
- Speech recognition depends on the browser. It works in Chrome and Edge, and can mishear, which is why the text box exists
- No authentication and no rate limiting, so the AI endpoint is bounded only by the Groq free tier
- Replies use the browser's default voice, which sounds different on each device
- Conversation history is kept in the page only, and resets on refresh
