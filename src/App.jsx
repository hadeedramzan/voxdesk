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
  "no-speech": "I did not hear anything. Press Mic and start speaking right away.",
  "not-allowed": "Microphone access is blocked. Allow it in your browser's site settings.",
  "audio-capture": "No microphone was found.",
  network: "Speech recognition needs an internet connection.",
};
const CHIPS = ["What is the status of ticket 1042?", "What is the status of ticket 9999?", "What are your support hours?", "I want to talk to a human"];
const btn = "rounded px-4 py-2 text-sm font-medium transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal-700 disabled:opacity-50";

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

  useEffect(() => { endRef.current?.scrollIntoView({ behavior: "smooth" }); }, [messages]);

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
      setMessages([...next, { role: "assistant", content: out.reply, ms, handoff: out.handoff }]);
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
    <div className="mx-auto flex h-dvh max-w-2xl flex-col p-4">
      <header>
        <h1 className="text-2xl font-semibold">VoxDesk</h1>
        <p className="text-sm text-slate-700">Voice support agent demo. Sample tickets 1042 to 1046; 9999 does not exist.</p>
        <p className="mb-3 text-xs text-slate-600">Fictional company. Handoff requests are logged but no human is contacted.</p>
      </header>

      <main className="flex min-h-0 flex-1 flex-col">
        <div className="flex-1 space-y-3 overflow-y-auto rounded bg-white p-3 shadow-sm" aria-live="polite">
          {messages.map((m, i) => (
            <div key={i} className={m.role === "user" ? "ml-auto max-w-[85%]" : "max-w-[85%]"}>
              <p className={`rounded px-3 py-2 text-sm ${m.role === "user" ? "bg-teal-700 text-white" : "bg-slate-100"}`}>{m.content}</p>
              {m.role === "assistant" && (m.ms || m.handoff) && (
                <p className="mt-1 text-xs text-slate-600">
                  {m.ms ? `Answered in ${m.ms.toLocaleString()} ms` : ""}{m.ms && m.handoff ? " | " : ""}{m.handoff ? "Handoff request logged" : ""}
                </p>
              )}
            </div>
          ))}
          <div ref={endRef} />
        </div>

        <p role="status" className="mt-2 flex h-5 items-center gap-2 text-xs font-medium text-teal-900">
          {status && <><span className="h-2 w-2 animate-pulse rounded-full bg-teal-700" aria-hidden="true" />{status}...</>}
          {speaking && <button onClick={stopSpeaking} className="underline">Stop</button>}
        </p>
        {err && <p role="alert" className="mb-2 rounded bg-red-50 p-2 text-sm text-red-800">{err}</p>}
        {!SR && <p className="mb-2 text-xs text-slate-700">Voice input needs Chrome or Edge. You can still type or use the suggestions.</p>}

        <div className="mb-2 flex flex-wrap gap-2">
          {CHIPS.map((c) => (
            <button key={c} disabled={busy} onClick={() => send(c)} className="rounded-full border border-slate-300 bg-white px-3 py-1 text-xs hover:border-teal-700 focus-visible:outline-2 focus-visible:outline-teal-700 disabled:opacity-50">{c}</button>
          ))}
        </div>

        <form onSubmit={(e) => { e.preventDefault(); send(input); }} className="flex gap-2">
          <button type="button" disabled={!SR || busy} onClick={toggleMic} aria-pressed={listening}
            className={`${btn} ${listening ? "bg-red-700 text-white" : "bg-slate-900 text-white"}`}>Mic</button>
          <input aria-label="Type your question" className="flex-1 rounded border border-slate-300 bg-white px-3 py-2 text-sm focus-visible:outline-2 focus-visible:outline-teal-700"
            placeholder="Or type a question" value={input} onChange={(e) => setInput(e.target.value)} />
          <button disabled={busy} className={`${btn} bg-teal-700 text-white hover:bg-teal-800`}>Send</button>
        </form>
        <label className="mt-2 flex items-center gap-2 text-xs text-slate-700">
          <input type="checkbox" checked={speak} onChange={(e) => setSpeak(e.target.checked)} /> Read replies aloud when I ask by voice
        </label>
      </main>
    </div>
  );
}
