import { Fragment, useEffect, useRef, useState } from 'react';
import { Sparkles, SendHorizontal, X } from 'lucide-react';
import { aiAssistantService, AiMessage, AiNotConfiguredError } from '../../services/aiAssistant.service';
import './AiAssistantChat.css';

export const AI_SUGGESTIONS = [
  'Who has no task today?',
  'Which tasks are stuck, and why?',
  'Which tasks are delayed?',
  'Who came late today?',
  'Give me a status summary for today',
];

/** **bold** inside a line, without HTML injection. */
function inline(text: string) {
  return text.split(/(\*\*[^*]+\*\*)/g).map((part, i) =>
    part.startsWith('**') && part.endsWith('**') ? <b key={i}>{part.slice(2, -2)}</b> : <Fragment key={i}>{part}</Fragment>);
}
/** The model answers in light Markdown: bullet lines and bold. Render just those. */
function Reply({ text }: { text: string }) {
  return <>{text.split('\n').map((line, i) => {
    const bullet = /^\s*[-*•]\s+/.test(line);
    const clean = line.replace(/^\s*[-*•]\s+/, '').replace(/^#+\s*/, '');
    if (!clean.trim()) return <div key={i} className="ai-gap" />;
    return bullet ? <div key={i} className="ai-li">{inline(clean)}</div> : <p key={i}>{inline(clean)}</p>;
  })}</>;
}

/** Chat with the AI assistant. The conversation lives in the parent so closing the sheet keeps it. */
export default function AiAssistantChat({ messages, setMessages, onClose }: {
  messages: AiMessage[]; setMessages: (m: AiMessage[]) => void; onClose: () => void;
}) {
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notSetUp, setNotSetUp] = useState(false);
  const end = useRef<HTMLDivElement>(null);
  useEffect(() => { end.current?.scrollIntoView?.({ block: 'end' }); }, [messages.length, busy]);

  const send = async (q: string) => {
    const question = q.trim();
    if (!question || busy) return;
    const next: AiMessage[] = [...messages, { role: 'user', text: question }];
    setMessages(next); setText(''); setError(''); setBusy(true);
    try {
      const reply = await aiAssistantService.ask(next);
      setMessages([...next, { role: 'assistant', text: reply }]);
    } catch (e) {
      if (e instanceof AiNotConfiguredError) setNotSetUp(true);
      else setError(e instanceof Error ? e.message : 'The AI could not answer right now. Try again.');
    } finally { setBusy(false); }
  };

  return <div className="ai-chat">
    <div className="grab" />
    <div className="ai-head">
      <span className="ai-mark"><Sparkles size={17} aria-hidden="true" /></span>
      <h2 id="sheetT">Voxel1_Daily assistant</h2><span className="ai-beta">Testing</span>
      <button type="button" className="ai-x" aria-label="Close" onClick={onClose}><X size={18} aria-hidden="true" /></button>
    </div>
    <p className="ai-sub">Ask about today's tasks, attendance and leave. Answers come from live app data. It can't change anything.</p>

    <div className="ai-msgs" aria-live="polite">
      {!messages.length && <div className="ai-sugs">{AI_SUGGESTIONS.map(s =>
        <button key={s} type="button" className="ai-sug" disabled={busy} onClick={() => void send(s)}>{s}</button>)}</div>}
      {messages.map((m, i) => <div key={i} className={`ai-msg ${m.role === 'user' ? 'me' : 'bot'}`}>
        {m.role === 'user' ? m.text : <Reply text={m.text} />}</div>)}
      {busy && <div className="ai-msg bot ai-typing" role="status">Thinking…</div>}
      {notSetUp && <div className="ai-note" role="alert">The Voxel1_Daily assistant isn't connected yet. It will start answering once the Gemini key is added.</div>}
      {error && <div className="ai-err" role="alert">{error}</div>}
      <div ref={end} />
    </div>

    <form className="ai-ask" onSubmit={e => { e.preventDefault(); void send(text); }}>
      <label className="vh" htmlFor="aiQ">Ask the Voxel1_Daily assistant</label>
      <input id="aiQ" placeholder="Ask about your team…" autoComplete="off" maxLength={500} enterKeyHint="send"
        value={text} onChange={e => setText(e.target.value)} />
      <button type="submit" className="ai-send" aria-label="Send" disabled={!text.trim() || busy}><SendHorizontal size={18} aria-hidden="true" /></button>
    </form>
  </div>;
}
