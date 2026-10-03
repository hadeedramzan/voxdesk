// Vercel serverless function: LLM agent with three tools (ticket lookup, FAQ lookup, human handoff request).
const SYSTEM =
  "You are a voice support agent for a fictional software company. " +
  "Use get_ticket_status for ticket questions, lookup_faq for general questions, and request_human_handoff when the customer asks for a person or you cannot help. " +
  "Answer ONLY from tool results. If the customer gave no ticket number, ask for it. If a tool finds nothing, say so. Never guess or invent details. " +
  "After a handoff request, say a request was logged and a person will follow up. " +
  "Your reply is read aloud, so use one or two short plain sentences, no markdown, no lists.";

// Sample FAQs of a fictional company, for demo purposes only.
const FAQS = [
  { a: "Support is available Monday to Friday, 9am to 6pm.", k: ["hours", "open", "available", "when", "time"] },
  { a: "Use the Forgot password link on the sign-in page. A reset email arrives within a few minutes.", k: ["password", "reset", "login", "sign", "locked"] },
  { a: "Refunds for duplicate or incorrect charges are processed within 5 to 7 business days after approval.", k: ["refund", "charge", "billing", "invoice", "money", "paid"] },
  { a: "You can export your data as CSV from Settings, then Data, then Export.", k: ["export", "csv", "download", "data"] },
  { a: "You can change your plan at any time from Settings, then Billing. Changes apply from the next billing date.", k: ["plan", "upgrade", "downgrade", "subscription", "cancel"] },
];

const TOOLS = [
  { type: "function", function: { name: "get_ticket_status", description: "Look up a support ticket by its numeric ID.",
    parameters: { type: "object", properties: { ticket_id: { type: "integer" } }, required: ["ticket_id"] } } },
  { type: "function", function: { name: "lookup_faq", description: "Find answers to general support questions (hours, passwords, refunds, exports, plans).",
    parameters: { type: "object", properties: { question: { type: "string" } }, required: ["question"] } } },
  { type: "function", function: { name: "request_human_handoff", description: "Log a request for a human agent to follow up.",
    parameters: { type: "object", properties: { reason: { type: "string" }, ticket_id: { type: "integer" } }, required: ["reason"] } } },
];

const sb = (path, init = {}) =>
  fetch(`${process.env.SUPABASE_URL}/rest/v1/${path}`, {
    ...init,
    headers: { "Content-Type": "application/json", apikey: process.env.SUPABASE_ANON_KEY, Authorization: `Bearer ${process.env.SUPABASE_ANON_KEY}`, ...init.headers },
  });

async function getTicket(id) {
  const n = Number(id);
  if (!Number.isInteger(n)) return { found: false };
  const r = await sb(`tickets?id=eq.${n}&select=id,subject,status,team,updated_at`);
  if (!r.ok) throw new Error(`Supabase returned ${r.status}`);
  const rows = await r.json();
  return rows.length ? { found: true, ...rows[0] } : { found: false };
}

function lookupFaq(question) {
  const words = String(question).toLowerCase();
  const hits = FAQS.map((f) => ({ f, s: f.k.filter((k) => words.includes(k)).length })).filter((x) => x.s > 0).sort((a, b) => b.s - a.s).slice(0, 2);
  return hits.length ? { found: true, answers: hits.map((h) => h.f.a) } : { found: false };
}

async function requestHandoff({ reason, ticket_id }) {
  const row = { reason: String(reason || "").slice(0, 300), ticket_id: Number.isInteger(ticket_id) ? ticket_id : null };
  const r = await sb("handoffs", { method: "POST", headers: { Prefer: "return=minimal" }, body: JSON.stringify(row) });
  if (!r.ok) throw new Error(`Supabase returned ${r.status}`);
  return { logged: true };
}

async function groq(messages) {
  const r = await fetch("https://api.groq.com/openai/v1/chat/completions", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${process.env.GROQ_API_KEY}` },
    body: JSON.stringify({ model: process.env.LLM_MODEL || "openai/gpt-oss-120b", temperature: 0.1, tools: TOOLS, messages }),
  });
  if (!r.ok) throw new Error(`Groq returned ${r.status}`);
  return (await r.json()).choices[0].message;
}

// Some model replies come back with the same sentence repeated twice. Collapse exact repeats.
function dedupe(text) {
  const t = String(text || "").trim();
  for (const sep of ["", " ", "\n"]) {
    const rest = t.length - sep.length;
    if (rest > 0 && rest % 2 === 0) {
      const h = rest / 2;
      if (t.slice(0, h) === t.slice(h + sep.length)) return t.slice(0, h);
    }
  }
  return t;
}

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).end();
  const history = Array.isArray(req.body?.messages) ? req.body.messages.slice(-12) : [];
  if (!history.length) return res.status(400).json({ error: "messages required" });
  let handoff = false;
  try {
    const messages = [{ role: "system", content: SYSTEM }, ...history.map((m) => ({ role: m.role, content: String(m.content).slice(0, 1000) }))];
    for (let i = 0; i < 3; i++) {
      const msg = await groq(messages);
      if (!msg.tool_calls?.length) return res.status(200).json({ reply: dedupe(msg.content) || "Sorry, I could not answer that.", handoff });
      messages.push({ role: "assistant", content: "", tool_calls: msg.tool_calls });
      for (const call of msg.tool_calls) {
        let result;
        try {
          const a = JSON.parse(call.function.arguments || "{}");
          const name = call.function.name;
          if (name === "get_ticket_status") result = await getTicket(a.ticket_id);
          else if (name === "lookup_faq") result = lookupFaq(a.question);
          else if (name === "request_human_handoff") { result = await requestHandoff(a); handoff = true; }
          else result = { error: "unknown tool" };
        } catch (e) { result = { error: e.message }; }
        messages.push({ role: "tool", tool_call_id: call.id, content: JSON.stringify(result) });
      }
    }
    res.status(200).json({ reply: "Sorry, I could not complete that.", handoff });
  } catch (e) {
    res.status(502).json({ error: e.message });
  }
}
