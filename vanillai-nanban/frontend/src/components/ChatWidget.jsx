import { useEffect, useRef, useState } from 'react';
import { api, errorMessage } from '../api.js';

const SUGGESTIONS = ['Will it rain today?', 'Should I carry an umbrella?', 'What should I wear?', 'Is it windy?', 'Good time for a run?'];
const Recognition = typeof window !== 'undefined' ? window.SpeechRecognition || window.webkitSpeechRecognition : null;

export default function ChatWidget({ place, signedIn }) {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState([]);
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const endRef = useRef(null);
  const loadedFor = useRef(false);
  const [listening, setListening] = useState(false);
  const [speak, setSpeak] = useState(false);
  const rec = useRef(null);

  // Signed-in users get their stored conversation back the first time the panel opens.
  useEffect(() => {
    if (!open || !signedIn || loadedFor.current) return;
    loadedFor.current = true;
    api.chatHistory()
      .then((rows) => setMessages(rows.map((r) => ({ from: r.senderType === 'user' ? 'user' : 'bot', text: r.message }))))
      .catch(() => { /* history is a nicety; chatting still works */ });
  }, [open, signedIn]);

  useEffect(() => {
    if (!signedIn) { loadedFor.current = false; setMessages([]); }
  }, [signedIn]);

  useEffect(() => {
    endRef.current?.scrollIntoView({ block: 'end' });
  }, [messages, busy, open]);

  async function send(raw) {
    const message = raw.trim();
    if (!message || busy || !place) return;
    setText('');
    setError('');
    setMessages((m) => [...m, { from: 'user', text: message }]);
    setBusy(true);
    try {
      const res = await api.chat({
        message,
        locationId: place.locationId || undefined,
        cityName: place.name,
        latitude: place.lat,
        longitude: place.lon,
      });
      setMessages((m) => [...m, { from: 'bot', text: res.reply, source: res.source }]);
      if (speak && 'speechSynthesis' in window) {
        try { window.speechSynthesis.cancel(); window.speechSynthesis.speak(new SpeechSynthesisUtterance(res.reply)); } catch { /* optional */ }
      }
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  function listen() {
    if (!Recognition) return;
    if (listening) { rec.current?.stop(); return; }
    const r = new Recognition();
    r.lang = navigator.language || 'en-US';
    r.interimResults = false;
    r.onresult = (e) => { const t = e.results[0]?.[0]?.transcript; if (t) send(t); };
    r.onend = () => setListening(false);
    r.onerror = () => setListening(false);
    rec.current = r;
    setListening(true);
    try { r.start(); } catch { setListening(false); }
  }

  if (!open) {
    return (
      <button type="button" className="chat-fab" onClick={() => setOpen(true)} aria-label="Open weather assistant">
        💬 Ask Nanban
      </button>
    );
  }

  return (
    <section className="chat" aria-label="Weather assistant">
      <header>
        <strong>Ask Nanban</strong>
        <span className="chat-tools">
          <button type="button" className={`icon-btn ${speak ? 'on' : ''}`} aria-pressed={speak} aria-label="Read answers aloud" title="Read answers aloud" onClick={() => setSpeak((v) => !v)}>🔊</button>
          <button type="button" className="icon-btn" aria-label="Close chat" onClick={() => setOpen(false)}>✕</button>
        </span>
      </header>

      <div className="chat-log" role="log" aria-live="polite">
        {!place && <p className="muted">Pick a location first, then ask me anything about its weather.</p>}
        {place && messages.length === 0 && (
          <div>
            <p className="muted">Ask about the weather in <strong>{place.name}</strong>:</p>
            <div className="chips">
              {SUGGESTIONS.map((s) => (
                <button key={s} type="button" className="chip chip-btn" onClick={() => send(s)}>{s}</button>
              ))}
            </div>
          </div>
        )}
        {messages.map((m, i) => (
          <div key={i} className={`bubble ${m.from}`}>
            {m.text}
            {m.source === 'rules' && <small>Answered directly from weather data</small>}
          </div>
        ))}
        {busy && <div className="bubble bot typing" aria-label="Nanban is typing">…</div>}
        {error && <p className="error" role="alert">{error}</p>}
        <div ref={endRef} />
      </div>

      <form onSubmit={(e) => { e.preventDefault(); send(text); }}>
        <label htmlFor="chat-input" className="sr-only">Your question</label>
        <input
          id="chat-input"
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder={place ? 'Ask about the weather…' : 'Pick a location first'}
          maxLength={1000}
          disabled={!place || busy}
        />
        {Recognition && <button type="button" className={`icon-btn mic ${listening ? 'on' : ''}`} aria-label={listening ? 'Stop listening' : 'Speak your question'} aria-pressed={listening} onClick={listen} disabled={!place || busy}>🎙️</button>}
        <button className="btn btn-primary" type="submit" disabled={!place || busy || !text.trim()}>Send</button>
      </form>
    </section>
  );
}
