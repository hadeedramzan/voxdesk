// Vercel serverless function: LLM agent with one tool (get_ticket_status).
const SYSTEM =
  "You are a voice support agent for a fictional software company. " +
  "Answer ticket questions ONLY from the get_ticket_status tool result. " +
  "If the customer has not given a ticket number, ask for it. " +
  "If the tool says the ticket was not found, say so and ask them to check the number. Never guess or invent ticket details. " +
  "Your reply is read aloud, so use one or two short plain sentences, no markdown, no lists.";

const TOOLS = [
  {
    type: "function",
    function: {
      name: "get_ticket_status",
      description: "Look up a support ticket by its numeric ID.",
      parameters: {
        type: "object",
        properties: { ticket_id: { type: "integer", description: "The ticket number" } },
        required: ["ticket_id"],
      },
    },
  },
];

async function getTicket(id) {
  const n = Number(id);
  if (!Number.isInteger(n)) return { found: false };
  const r = await fetch(
    `${process.env.SUPABASE_URL}/rest/v1/tickets?id=eq.${n}&select=id,subject,status,team,updated_at`,
    { headers: { apikey: process.env.SUPABASE_ANON_KEY, Authorization: `Bearer ${process.env.SUPABASE_ANON_KEY}` } }
  );
  if (!r.ok) throw new Error(`Supabase returned ${r.status}`);
  const rows = await r.json();
  return rows.length ? { found: true, ...rows[0] } : { found: false };
}

async function groq(messages) {
  const r = await fetch("https://api.groq.com/openai/v1/chat/completions", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${process.env.GROQ_API_KEY}` },
    body: JSON.stringify({
      model: process.env.LLM_MODEL || "openai/gpt-oss-120b",
      temperature: 0.1,
      tools: TOOLS,
      messages,
    }),
  });
  if (!r.ok) throw new Error(`Groq returned ${r.status}`);
  return (await r.json()).choices[0].message;
}

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).end();
  const history = Array.isArray(req.body?.messages) ? req.body.messages.slice(-12) : [];
  if (!history.length) return res.status(400).json({ error: "messages required" });
  try {
    const messages = [{ role: "system", content: SYSTEM }, ...history.map((m) => ({ role: m.role, content: String(m.content) }))];
    for (let i = 0; i < 3; i++) {
      const msg = await groq(messages);
      if (!msg.tool_calls?.length) return res.status(200).json({ reply: msg.content || "Sorry, I could not answer that." });
      messages.push({ role: "assistant", content: msg.content || "", tool_calls: msg.tool_calls });
      for (const call of msg.tool_calls) {
        let result;
        try {
          const args = JSON.parse(call.function.arguments || "{}");
          result = call.function.name === "get_ticket_status" ? await getTicket(args.ticket_id) : { error: "unknown tool" };
        } catch (e) {
          result = { error: e.message };
        }
        messages.push({ role: "tool", tool_call_id: call.id, content: JSON.stringify(result) });
      }
    }
    res.status(200).json({ reply: "Sorry, I could not complete that lookup." });
  } catch (e) {
    res.status(502).json({ error: e.message });
  }
}
