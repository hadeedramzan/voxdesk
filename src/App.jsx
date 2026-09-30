import { useEffect, useRef, useState } from "react";

const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
const btn = "rounded px-4 py-2 text-sm font-medium disabled:opacity-50";

export default function App() {
  const [messages, setMessages] = useState([
    { role: "assistant", content: "Hi, I am VoxDesk. Ask me about a support ticket by number." },
  ]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [listening, setListening] = useState(false);
  const [speak, setSpeak] = useState(true);
  const [err, setErr] = useState("");
  const endRef = useRef(null);
  const recRef = useRef(null);

  useEffect(() => { endRef.current?.scrollIntoView({ behavior: "smooth" }); }, [messages]);

  function say(text) {
    if (!speak || !window.speechSynthesis) return;
    window.speechSynthesis.cancel();
    window.speechSynthesis.speak(new SpeechSynthesisUtterance(text));
  }

  async function send(text) {
    const q = text.trim();
    if (!q || busy) return;
    setErr("");
    setInput("");
    const next = [...messages, { role: "user", content: q }];
    setMessages(next);
    setBusy(true);
    try {
      const r = await fetch("/api/agent", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: next.slice(1) }),
      });
      const out = await r.json();
      if (!r.ok) throw new Error(out.error || "Request failed");
      setMessages([...next, { role: "assistant", content: out.reply }]);
      say(out.reply);
    } catch (e) {
      setErr(e.message);
    } finally {
      setBusy(false);
    }
  }

  function toggleMic() {
    if (listening) return recRef.current?.stop();
    const rec = new SR();
    rec.lang = "en-US";
    rec.interimResults = false;
    rec.onresult = (e) => send(e.results[0][0].transcript);
    rec.onerror = (e) => { setErr(`Microphone error: ${e.error}`); setListening(false); };
    rec.onend = () => setListening(false);
    recRef.current = rec;
    window.speechSynthesis?.cancel();
    setListening(true);
    rec.start();
  }

  return (
    <div className="mx-auto flex h-screen max-w-2xl flex-col p-4">
      <h1 className="text-2xl font-semibold">VoxDesk</h1>
      <p className="mb-3 text-sm text-slate-600">
        Voice support agent. Try tickets 1042 to 1046, or 9999 (does not exist).
      </p>

      <div className="flex-1 space-y-2 overflow-y-auto rounded bg-white p-3 shadow-sm" aria-live="polite">
        {messages.map((m, i) => (
          <p key={i} className={`max-w-[85%] rounded px-3 py-2 text-sm ${m.role === "user" ? "ml-auto bg-teal-700 text-white" : "bg-slate-100"}`}>
            {m.content}
          </p>
        ))}
        {busy && <p className="text-xs text-slate-500">Thinking...</p>}
        <div ref={endRef} />
      </div>

      {err && <p role="alert" className="mt-2 rounded bg-red-50 p-2 text-sm text-red-800">{err}</p>}
      {!SR && <p className="mt-2 text-xs text-slate-500">Voice input is not supported in this browser. Use Chrome or Edge, or type below.</p>}

      <form onSubmit={(e) => { e.preventDefault(); send(input); }} className="mt-3 flex gap-2">
        <button type="button" disabled={!SR || busy} onClick={toggleMic} aria-pressed={listening}
          className={`${btn} ${listening ? "bg-red-600 text-white" : "bg-slate-900 text-white"}`}>
          {listening ? "Stop" : "Mic"}
        </button>
        <input className="flex-1 rounded border border-slate-300 bg-white px-3 py-2 text-sm focus:outline-2 focus:outline-teal-700"
          placeholder="Or type a question" value={input} onChange={(e) => setInput(e.target.value)} />
        <button disabled={busy} className={`${btn} bg-teal-700 text-white hover:bg-teal-800`}>Send</button>
      </form>
      <label className="mt-2 flex items-center gap-2 text-xs text-slate-600">
        <input type="checkbox" checked={speak} onChange={(e) => setSpeak(e.target.checked)} /> Speak replies
      </label>
    </div>
  );
}
