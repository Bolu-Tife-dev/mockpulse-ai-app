import { useCallback, useEffect, useRef, useState } from 'react';
import { useInterviewStore } from '@/store/interviewStore';
import { useSettingsStore } from '@/store/settingsStore';
import { useSpeechInput } from '@/hooks/useSpeechInput';
import { useUiStore } from '@/store/uiStore';
import { STAGE_LABELS } from '@/services/ai/prompts';
import type { ChatMessage } from '@/types';

function scorePct(msg: ChatMessage): number | null {
  const e = msg.meta?.evaluation;
  if (!e) return null;
  return Math.round(e.score * 100);
}

export default function ChatPanel() {
  const messages = useInterviewStore((s) => s.messages);
  const busy = useInterviewStore((s) => s.busy);
  const thinking = useInterviewStore((s) => s.thinking);
  const speaking = useInterviewStore((s) => s.speaking);
  const micOn = useInterviewStore((s) => s.micOn);
  const status = useInterviewStore((s) => s.status);
  const stage = useInterviewStore((s) => s.stage);
  const interviewerName = useSettingsStore((s) => s.settings.interviewerName);

  const [draft, setDraft] = useState('');
  const [filter, setFilter] = useState<'all' | 'answered'>('all');
  const scrollerRef = useRef<HTMLDivElement>(null);
  const draftRef = useRef('');
  draftRef.current = draft;

  const send = useCallback((text: string) => {
    const t = text.trim();
    if (!t || useInterviewStore.getState().busy) return;
    setDraft('');
    void useInterviewStore.getState().submitAnswer(t);
  }, []);

  const onPartial = useCallback((text: string) => setDraft(text), []);
  const onFinal = useCallback((text: string) => {
    const engine = useSettingsStore.getState().settings.sttEngine;
    if (engine === 'groq-whisper') {
      setDraft((prev) => (prev ? `${prev} ${text}` : text).trim());
    } else {
      setDraft(text);
    }
  }, []);

  /* Half-duplex: listen only while the interviewer is not talking. */
  const { listening, partial, level, error, blocked } = useSpeechInput({
    active: micOn && !speaking && status === 'live',
    onFinal,
    onPartial,
  });

  /* Hands-free: send once the candidate pauses. */
  useEffect(() => {
    if (!listening || busy || speaking) return;
    const text = draftRef.current.trim();
    if (!text) return;
    const t = window.setTimeout(() => send(text), 2600);
    return () => window.clearTimeout(t);
  }, [draft, listening, busy, speaking, send]);

  useEffect(() => {
    const el = scrollerRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages, partial, thinking]);

  /* Mirror the live dictation into the shared caption strip. */
  const setMicCaption = useUiStore((s) => s.setMicCaption);
  useEffect(() => {
    setMicCaption(listening ? draft.trim() : '');
  }, [draft, listening, setMicCaption]);
  useEffect(() => () => setMicCaption(''), [setMicCaption]);

  const visible = filter === 'all' ? messages : messages.filter((m) => m.speaker !== 'interviewer');

  return (
    <div className="flex h-full min-h-0 flex-col">
      {/* transcript header */}
      <div className="flex shrink-0 items-center justify-between border-b border-white/8 px-4 py-2.5">
        <div className="flex items-center gap-2">
          <span className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-400">Transcript</span>
          <span className="chip !py-0.5 !text-[10px]">{STAGE_LABELS[stage]}</span>
        </div>
        <div className="flex gap-1 rounded-lg border border-white/10 bg-black/25 p-0.5">
          {(['all', 'answered'] as const).map((f) => (
            <button
              key={f}
              type="button"
              onClick={() => setFilter(f)}
              className={`rounded-md px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wide transition ${
                filter === f ? 'bg-white/10 text-white' : 'text-slate-500 hover:text-slate-300'
              }`}
            >
              {f === 'all' ? 'Full loop' : 'My answers'}
            </button>
          ))}
        </div>
      </div>

      {/* messages */}
      <div ref={scrollerRef} className="scrollbar-thin min-h-0 flex-1 space-y-3.5 overflow-y-auto px-4 py-4">
        {visible.length === 0 && (
          <div className="mt-8 text-center text-xs leading-relaxed text-slate-500">
            The interview transcript will appear here.
            <br />
            Answer out loud or type below.
          </div>
        )}

        {visible.map((m) => {
          if (m.speaker === 'system') {
            return (
              <div key={m.id} className="my-2 rounded-xl border border-night-400/25 bg-night-500/10 px-3.5 py-2.5">
                <div className="mb-1 text-[10px] font-semibold uppercase tracking-widest text-night-300">Hint</div>
                <p className="whitespace-pre-wrap text-[12.5px] leading-relaxed text-slate-300">{m.text}</p>
              </div>
            );
          }

          const mine = m.speaker === 'candidate';
          const pct = scorePct(m);

          return (
            <div key={m.id} className={`flex gap-2.5 ${mine ? 'flex-row-reverse' : ''}`}>
              {!mine && (
                <div className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-night-500 to-night-800 text-[11px] font-bold text-white">
                  {interviewerName.slice(0, 1).toUpperCase()}
                </div>
              )}
              <div className={`max-w-[85%] ${mine ? 'items-end text-right' : ''} flex flex-col gap-1.5`}>
                <div
                  className={`rounded-2xl px-3.5 py-2.5 text-left text-[13px] leading-relaxed ${
                    mine
                      ? 'rounded-tr-sm bg-night-600/80 text-white'
                      : 'rounded-tl-sm border border-white/10 bg-white/[0.06] text-slate-200'
                  }`}
                >
                  <span className="whitespace-pre-wrap">{m.text}</span>
                </div>
                <div className={`flex items-center gap-2 px-1 ${mine ? 'justify-end' : ''}`}>
                  <span className="text-[10px] text-slate-600">
                    {new Date(m.ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                  </span>
                  {!mine && pct !== null && (
                    <span
                      title="Live evaluation of the previous answer"
                      className={`rounded px-1.5 py-0.5 text-[10px] font-bold tabular-nums ${
                        pct >= 75
                          ? 'bg-pulse-500/15 text-pulse-400'
                          : pct >= 50
                            ? 'bg-amber-400/15 text-amber-300'
                            : 'bg-rose-500/15 text-rose-300'
                      }`}
                    >
                      {pct}
                    </span>
                  )}
                </div>
              </div>
            </div>
          );
        })}

        {thinking && (
          <div className="flex items-center gap-2.5">
            <div className="flex h-7 w-7 items-center justify-center rounded-full bg-gradient-to-br from-night-500 to-night-800 text-[11px] font-bold text-white">
              {interviewerName.slice(0, 1).toUpperCase()}
            </div>
            <div className="flex items-center gap-1 rounded-2xl rounded-tl-sm border border-white/10 bg-white/[0.06] px-3.5 py-3">
              {[0, 1, 2].map((i) => (
                <span
                  key={i}
                  className="h-1.5 w-1.5 animate-bounce rounded-full bg-slate-400"
                  style={{ animationDelay: `${i * 120}ms` }}
                />
              ))}
            </div>
          </div>
        )}
      </div>

      {/* composer */}
      <div className="shrink-0 border-t border-white/8 bg-black/20 px-4 py-3">
        {(error || blocked) && (
          <p className="mb-2 rounded-lg border border-amber-400/25 bg-amber-400/10 px-3 py-2 text-[11px] leading-relaxed text-amber-200">
            {blocked ? `Microphone unavailable: ${error}` : error}
          </p>
        )}

        <div
          className={`rounded-2xl border transition ${
            listening ? 'border-pulse-500/50 bg-pulse-500/[0.06]' : 'border-white/12 bg-black/30'
          }`}
        >
          {listening && (
            <div className="flex items-center justify-between px-3 pt-2.5">
              <span className="flex items-center gap-2 text-[11px] font-semibold text-pulse-400">
                <span className="relative flex h-2 w-2">
                  <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-pulse-400 opacity-75" />
                  <span className="relative inline-flex h-2 w-2 rounded-full bg-pulse-400" />
                </span>
                Listening — just speak, it sends when you pause
              </span>
              <span className="flex h-4 items-end gap-0.5" aria-hidden>
                {[0, 1, 2, 3, 4, 5].map((i) => (
                  <span
                    key={i}
                    className="w-1 rounded-full bg-pulse-400/80 transition-all"
                    style={{
                      height: `${Math.max(2, Math.round(level * 16 * (i % 2 ? 0.6 : 1)))}px`,
                    }}
                  />
                ))}
              </span>
            </div>
          )}

          <textarea
            className="scrollbar-thin w-full resize-none bg-transparent px-3.5 py-3 text-[13px] leading-relaxed text-slate-100 placeholder-slate-500 outline-none"
            rows={listening || draft ? 3 : 1}
            placeholder={listening ? 'Listening…' : 'Type your answer, or hit the mic to answer out loud'}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                send(draft);
              }
            }}
          />

          <div className="flex items-center justify-between px-2.5 pb-2.5">
            <button
              type="button"
              onClick={() => useInterviewStore.getState().toggleMic()}
              className={`flex h-9 w-9 items-center justify-center rounded-full transition ${
                micOn ? 'bg-pulse-500/15 text-pulse-400 hover:bg-pulse-500/25' : 'bg-rose-500/15 text-rose-300'
              }`}
              title={micOn ? 'Stop dictation' : 'Start dictation'}
            >
              {micOn ? (
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                  <rect x="9" y="2.5" width="6" height="11" rx="3" />
                  <path d="M5 11a7 7 0 0 0 14 0M12 18v3.5" />
                </svg>
              ) : (
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                  <path d="M9 5a3 3 0 0 1 6 0v5M5 11a7 7 0 0 0 11.3 5.5M12 18v3.5M4 4l16 16" />
                </svg>
              )}
            </button>

            <span className="px-2 text-[10px] text-slate-600">
              {partial ? 'transcribing…' : 'Enter to send · Shift+Enter for a new line'}
            </span>

            <button
              type="button"
              onClick={() => send(draft)}
              disabled={!draft.trim() || busy}
              className="btn-primary !rounded-full !px-4 !py-1.5 !text-[12px]"
            >
              Send
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
