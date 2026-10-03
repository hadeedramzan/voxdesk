import { useEffect, useRef, useState } from "react";

const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
const DIGITS = { zero: 0, oh: 0, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9 };
const DW = "(?:zero|oh|one|two|three|four|five|six|seven|eight|nine)";
// Turns "one zero four two" and "1 0 4 2" into "1042". Not handled: "ten forty two".
function normalizeNumbers(t) {
  return t
    .replace(new RegExp(`\\b(?:${DW}[\\s-]+){2,}${DW}\\b`, "gi"), (m) => m.split(/[\s-]+/).map((w) => DIGITS[w.toLowerCase()]).join(""))
    .replace(/\b\d(?:\s\d){2,}\b/g, (m) => m.replace(/\s/g, ""));
}
const MIC_ERRORS = {
  "no-speech": "I did not hear anything. Press the microphone and start speaking right away.",
  "not-allowed": "Microphone access is blocked. Allow it in your browser's site settings.",
  "audio-capture": "No microphone was found.",
  network: "Speech recognition needs an internet connection.",
};
const CHIPS = ["What is the status of ticket 1042?", "What is the status of ticket 9999?", "What are your support hours?", "I want to talk to a human"];
const STATUS = {
  open: ["Open", "bg-blue-50 text-blue-900", "bg-blue-700"],
  in_progress: ["In progress", "bg-amber-50 text-amber-900", "bg-amber-600"],
  waiting_on_customer: ["Waiting on customer", "bg-slate-100 text-slate-800", "bg-slate-500"],
  resolved: ["Resolved", "bg-green-50 text-green-900", "bg-green-700"],
};
const ring = "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-700";

function Logo({ width = 44, active = false }) {
  return (
    <svg width={width} height={(width * 56) / 72} viewBox="0 0 72 56" role="img" aria-label="VoxDesk logo">
      <path d="M10 0H62A10 10 0 0 1 72 10V20A6 6 0 0 0 72 32V46A10 10 0 0 1 62 56H10A10 10 0 0 1 0 46V32A6 6 0 0 0 0 20V10A10 10 0 0 1 10 0Z" fill="#4338CA" />
      {[[16, 12], [26, 24], [36, 34], [46, 20], [56, 10]].map(([x, h]) => (
        <rect key={x} x={x} y={28 - h / 2} width="5" height={h} rx="2.5" fill="#fff" className={active ? "bar" : ""} style={{ animationDelay: `${x * 0.012}s` }} />
      ))}
    </svg>
  );
}

function MicIcon() {
  return (
    <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="9" y="3" width="6" height="11" rx="3" /><path d="M5 11a7 7 0 0 0 14 0M12 18v3" />
    </svg>
  );
}

function TicketCard({ t }) {
  const [label, tone, dot] = STATUS[t.status] || [t.status, "bg-slate-100 text-slate-800", "bg-slate-500"];
  return (
    <div className="mt-2 rounded-lg border border-slate-200 bg-white p-3 text-sm">
      <div className="flex items-center justify-between gap-2">
        <p className="font-medium">Ticket #{t.id}</p>
        <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium ${tone}`}>
          <span className={`h-1.5 w-1.5 rounded-full ${dot}`} aria-hidden="true" />{label}
        </span>
      </div>
      <p className="mt-1 text-slate-700">{t.subject}</p>
      <p className="mt-1 text-xs text-slate-600">{t.team}{t.updated_at ? ` | Updated ${new Date(t.updated_at).toLocaleDateString()}` : ""}</p>
    </div>
  );
}

export default function App() {
  const [messages, setMessages] = useState([{ role: "assistant", content: "Hi, I am VoxDesk. Ask about a support ticket by number, or a general support question." }]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [listening, setListening] = useState(false);
  const [speaking, setSpeaking] = useState(false);
  const [speak, setSpeak] = useState(true);
  const [err, setErr] = useState("");
  const endRef = useRef(null);
  const recRef = useRef(null);

  useEffect(() => { endRef.current?.scrollIntoView({ behavior: "smooth" }); }, [messages, busy]);

  function say(text) {
    if (!window.speechSynthesis) return;
    window.speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(text);
    u.onstart = () => setSpeaking(true);
    u.onend = u.onerror = () => setSpeaking(false);
    window.speechSynthesis.speak(u);
  }
  function stopSpeaking() { window.speechSynthesis?.cancel(); setSpeaking(false); }

  async function send(text, viaMic = false) {
    const q = normalizeNumbers(text.trim());
    if (!q || busy) return;
    stopSpeaking();
    setErr(""); setInput("");
    const next = [...messages, { role: "user", content: q }];
    setMessages(next);
    setBusy(true);
    const t0 = performance.now();
    try {
      const r = await fetch("/api/agent", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: next.slice(1).map(({ role, content }) => ({ role, content })) }),
      });
      const out = await r.json();
      if (!r.ok) throw new Error(out.error || "Request failed");
      const ms = Math.round(performance.now() - t0);
      setMessages([...next, { role: "assistant", content: out.reply, ms, handoff: out.handoff, ticket: out.ticket, sources: out.sources }]);
      if (speak && viaMic) say(out.reply);
    } catch (e) { setErr(e.message); } finally { setBusy(false); }
  }

  function toggleMic() {
    if (listening) return recRef.current?.stop();
    stopSpeaking();
    const rec = new SR();
    rec.lang = "en-US";
    rec.onresult = (e) => send(e.results[0][0].transcript, true);
    rec.onerror = (e) => { setErr(MIC_ERRORS[e.error] || `Microphone error: ${e.error}`); setListening(false); };
    rec.onend = () => setListening(false);
    recRef.current = rec;
    setListening(true);
    rec.start();
  }

  const status = listening ? "Listening" : busy ? "Thinking" : speaking ? "Speaking" : "";

  return (
    <div className="mx-auto flex h-dvh max-w-2xl flex-col px-4 pb-4 pt-5">
      <header className="mb-3 flex items-center gap-3">
        <Logo active={listening || busy || speaking} />
        <div>
          <h1 className="text-xl font-semibold leading-tight">VoxDesk</h1>
          <p className="text-sm text-slate-700">Voice support agent demo. Sample tickets 1042 to 1046; 9999 does not exist.</p>
        </div>
      </header>

      <main className="flex min-h-0 flex-1 flex-col">
        <div className="flex-1 space-y-4 overflow-y-auto rounded-xl border border-slate-200 bg-white p-4" aria-live="polite">
          {messages.map((m, i) => (
            <div key={i} className={`msg-in ${m.role === "user" ? "ml-auto max-w-[85%]" : "max-w-[90%]"}`}>
              <p className={`rounded-2xl px-3.5 py-2 text-sm ${m.role === "user" ? "bg-indigo-700 text-white" : "bg-slate-100"}`}>{m.content}</p>
              {m.ticket && <TicketCard t={m.ticket} />}
              {m.role === "assistant" && (m.ms || m.handoff || m.sources?.length > 0) && (
                <p className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-600">
                  {m.sources?.length > 0 && <span>Source: {[...new Set(m.sources)].join(", ")}</span>}
                  {m.handoff && <span className="rounded-full border border-indigo-200 bg-indigo-50 px-2 py-0.5 font-medium text-indigo-900">Handoff request logged</span>}
                  {m.ms && <span>Answered in {m.ms.toLocaleString()} ms</span>}
                </p>
              )}
            </div>
          ))}
          {busy && (
            <div className="msg-in max-w-[90%]">
              <p className="inline-flex gap-1 rounded-2xl bg-slate-100 px-3.5 py-3" aria-hidden="true">
                {[0, 1, 2].map((i) => <span key={i} className="dot h-1.5 w-1.5 rounded-full bg-slate-500" style={{ animationDelay: `${i * 0.15}s` }} />)}
              </p>
            </div>
          )}
          <div ref={endRef} />
        </div>

        <p role="status" className="mt-2 flex h-5 items-center gap-2 text-xs font-medium text-indigo-900">
          {status && <><span className="h-2 w-2 animate-pulse rounded-full bg-indigo-700 motion-reduce:animate-none" aria-hidden="true" />{status}...</>}
          {speaking && <button onClick={stopSpeaking} className={`underline ${ring}`}>Stop</button>}
        </p>
        {err && <p role="alert" className="mb-2 rounded-lg bg-red-50 p-2 text-sm text-red-800">{err}</p>}
        {!SR && <p className="mb-2 text-xs text-slate-700">Voice input needs Chrome or Edge. You can still type or use the suggestions.</p>}

        <div className="mb-3 flex flex-wrap gap-2">
          {CHIPS.map((c) => (
            <button key={c} disabled={busy} onClick={() => send(c)} className={`rounded-full border border-slate-300 bg-white px-3 py-1.5 text-xs hover:border-indigo-700 disabled:opacity-50 ${ring}`}>{c}</button>
          ))}
        </div>

        <form onSubmit={(e) => { e.preventDefault(); send(input); }} className="flex items-center gap-2">
          <button type="button" disabled={!SR || busy} onClick={toggleMic} aria-pressed={listening} aria-label="Voice input"
            className={`relative h-14 w-14 shrink-0 rounded-full text-white transition-colors disabled:opacity-40 ${listening ? "bg-red-700" : "bg-indigo-700 hover:bg-indigo-800"} ${ring}`}>
            {listening && <span className="absolute inset-0 animate-ping rounded-full bg-red-700/40 motion-reduce:animate-none" aria-hidden="true" />}
            <span className="relative flex items-center justify-center"><MicIcon /></span>
          </button>
          <input aria-label="Type your question" className={`h-12 min-w-0 flex-1 rounded-full border border-slate-300 bg-white px-4 text-sm ${ring}`}
            placeholder="Or type a question" value={input} onChange={(e) => setInput(e.target.value)} />
          <button disabled={busy} className={`h-12 rounded-full bg-indigo-700 px-5 text-sm font-medium text-white hover:bg-indigo-800 disabled:opacity-50 ${ring}`}>Send</button>
        </form>
        <label className="mt-2 flex items-center gap-2 text-xs text-slate-700">
          <input type="checkbox" checked={speak} onChange={(e) => setSpeak(e.target.checked)} /> Read replies aloud when I ask by voice
        </label>
      </main>
    </div>
  );
}
