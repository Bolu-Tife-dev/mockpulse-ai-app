import { useEffect, useMemo, useRef, useState } from 'react';
import InterviewerTile from '@/components/meeting/InterviewerTile';
import ParticipantTile from '@/components/meeting/ParticipantTile';
import MeetingControls from '@/components/meeting/MeetingControls';
import ChatPanel from '@/components/meeting/ChatPanel';
import CodePanel from '@/components/meeting/CodePanel';
import Whiteboard from '@/components/meeting/Whiteboard';
import { useCamera } from '@/hooks/useCamera';
import { useScreenShare } from '@/hooks/useScreenShare';
import { useInterviewStore } from '@/store/interviewStore';
import { useSettingsStore } from '@/store/settingsStore';
import { useUiStore, type PanelTab } from '@/store/uiStore';
import { SENIORITY, STAGE_LABELS, TRACK_LABELS } from '@/services/ai/prompts';

const TABS: { id: PanelTab; label: string; icon: string }[] = [
  { id: 'chat', label: 'Transcript', icon: '💬' },
  { id: 'code', label: 'Code', icon: '‹›' },
  { id: 'board', label: 'Whiteboard', icon: '▭' },
];

export default function Meeting() {
  const status = useInterviewStore((s) => s.status);
  const busy = useInterviewStore((s) => s.busy);
  const stage = useInterviewStore((s) => s.stage);
  const config = useInterviewStore((s) => s.config);
  const micOn = useInterviewStore((s) => s.micOn);
  const camOn = useInterviewStore((s) => s.camOn);
  const screenShare = useInterviewStore((s) => s.screenShare);
  const speaking = useInterviewStore((s) => s.speaking);
  const messages = useInterviewStore((s) => s.messages);
  const error = useInterviewStore((s) => s.error);
  const clearError = useInterviewStore((s) => s.clearError);
  const endInterview = useInterviewStore((s) => s.endInterview);
  const candidateName = useInterviewStore((s) => s.candidateName);

  const interviewerName = useSettingsStore((s) => s.settings.interviewerName);

  const panelTab = useUiStore((s) => s.panelTab);
  const setPanelTab = useUiStore((s) => s.setPanelTab);
  const panelWidth = useUiStore((s) => s.panelWidth);
  const setPanelWidth = useUiStore((s) => s.setPanelWidth);
  const view = useUiStore((s) => s.meetingView);
  const setView = useUiStore((s) => s.setMeetingView);
  const captionsOn = useUiStore((s) => s.captionsOn);
  const toggleCaptions = useUiStore((s) => s.toggleCaptions);
  const micCaption = useUiStore((s) => s.micCaption);

  const camera = useCamera(camOn);
  const screen = useScreenShare();

  const [dragging, setDragging] = useState(false);
  const lastInterviewerMsg = useRef('');

  /* --------------------------- screen share sync --------------------------- */
  useEffect(() => {
    if (screenShare && !screen.active && !screen.pending) void screen.start();
    if (!screenShare && screen.active) screen.stop();
  }, [screenShare, screen]);

  useEffect(() => {
    if (!screen.active && !screen.pending && useInterviewStore.getState().screenShare) {
      useInterviewStore.setState({ screenShare: false });
    }
  }, [screen.active, screen.pending]);

  /* ------------------------------ shortcuts -------------------------------- */
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)) return;
      if (e.altKey && !e.ctrlKey && !e.metaKey) {
        const key = e.key.toLowerCase();
        if (key === 'm') useInterviewStore.getState().toggleMic();
        if (key === 'v') useInterviewStore.getState().toggleCam();
        if (key === 's') useInterviewStore.getState().toggleScreen();
        if (key === 'c') useUiStore.getState().toggleCaptions();
      }
      if (e.key === 'Escape' && useInterviewStore.getState().screenShare) {
        useInterviewStore.setState({ screenShare: false });
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  /* ----------------------------- panel resize ------------------------------ */
  useEffect(() => {
    if (!dragging) return;
    const move = (e: PointerEvent) => setPanelWidth(window.innerWidth - e.clientX);
    const up = () => setDragging(false);
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
    const prevCursor = document.body.style.cursor;
    const prevSelect = document.body.style.userSelect;
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
    return () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      document.body.style.cursor = prevCursor;
      document.body.style.userSelect = prevSelect;
    };
  }, [dragging, setPanelWidth]);

  /* -------------------------------- captions -------------------------------- */
  const caption = useMemo(() => {
    if (!captionsOn) return null;
    if (micCaption && !speaking) return { who: 'You', text: micCaption };
    if (speaking && lastInterviewerMsg.current) return { who: interviewerName, text: lastInterviewerMsg.current };
    return null;
  }, [captionsOn, interviewerName, micCaption, speaking]);

  useEffect(() => {
    const last = [...messages].reverse().find((m) => m.speaker === 'interviewer');
    if (last) lastInterviewerMsg.current = last.text;
  }, [messages]);

  /* --------------------------------- tiles ---------------------------------- */
  const thumbs = (
    <>
      <ParticipantTile
        ref={camera.videoRef}
        label={candidateName}
        sublabel={camOn ? undefined : 'camera off'}
        mirrored
        muted={!micOn}
        className={camera.state === 'live' ? '' : 'flex items-center justify-center'}
      />
      {screen.active && (
        <ParticipantTile ref={screen.videoRef} label="Shared screen" sublabel="You are presenting" />
      )}
    </>
  );

  const stageIndex = Math.max(1, config.stages.indexOf(stage) + 1);

  return (
    <div className="relative flex h-full flex-col">
      {/* ------------------------------- overlays ------------------------------ */}
      {status === 'connecting' && (
        <div className="absolute inset-0 z-40 flex items-center justify-center bg-night-950/85 backdrop-blur-sm">
          <div className="flex flex-col items-center gap-4 text-center">
            <div className="h-12 w-12 animate-spin rounded-full border-2 border-night-500 border-t-transparent" />
            <div>
              <p className="text-sm font-semibold text-white">Joining the interview room…</p>
              <p className="mt-1 text-xs text-slate-400">
                Connecting to {interviewerName} · opening camera and microphone
              </p>
            </div>
          </div>
        </div>
      )}

      {status === 'ended' && (
        <div className="absolute inset-0 z-40 flex items-center justify-center bg-night-950/85 backdrop-blur-sm">
          <div className="flex max-w-sm flex-col items-center gap-4 text-center">
            <div className="h-12 w-12 animate-spin rounded-full border-2 border-pulse-500 border-t-transparent" />
            <div>
              <p className="text-sm font-semibold text-white">Interview complete</p>
              <p className="mt-1 text-xs leading-relaxed text-slate-400">
                {busy
                  ? 'Your interviewer is writing the detailed scorecard — technical accuracy, communication, code efficiency, problem solving and seniority alignment.'
                  : 'Preparing your report…'}
              </p>
            </div>
          </div>
        </div>
      )}

      {error && status !== 'connecting' && (
        <div className="absolute right-4 top-4 z-40 max-w-md animate-fade-in-up rounded-xl border border-rose-500/30 bg-rose-950/85 px-4 py-3 shadow-glass backdrop-blur">
          <div className="flex items-start gap-3">
            <span className="mt-0.5 text-rose-400">⚠</span>
            <div className="min-w-0 flex-1">
              <p className="text-[13px] font-semibold text-rose-200">Something went wrong</p>
              <p className="mt-0.5 break-words text-[11.5px] leading-relaxed text-rose-200/80">{error}</p>
            </div>
            <button type="button" className="text-rose-300 hover:text-white" onClick={clearError} aria-label="Dismiss">
              ✕
            </button>
          </div>
        </div>
      )}

      {/* --------------------------------- body -------------------------------- */}
      <div className="flex min-h-0 flex-1">
        {/* stage header + video area */}
        <section className="flex min-w-0 flex-1 flex-col p-3.5">
          <div className="mb-3 flex shrink-0 flex-wrap items-center justify-between gap-3">
            <div className="flex min-w-0 flex-wrap items-center gap-2">
              <span className="flex items-center gap-2 rounded-full border border-night-400/35 bg-night-500/15 px-3 py-1.5 text-[11.5px] font-semibold text-night-200">
                <span className="h-1.5 w-1.5 rounded-full bg-night-400" />
                Stage {stageIndex}/{config.stages.length} · {STAGE_LABELS[stage]}
              </span>
              <span className="chip !py-1 !text-[11px]">{TRACK_LABELS[config.track]}</span>
              <span className="chip !py-1 !text-[11px]">{SENIORITY[config.seniority].title}</span>
              <span className="chip !py-1 !text-[11px]">
                {messages.filter((m) => m.speaker === 'interviewer').length} questions
              </span>
            </div>

            <div className="flex items-center gap-2">
              <div className="flex gap-0.5 rounded-lg border border-white/10 bg-black/25 p-0.5">
                {(['speaker', 'grid'] as const).map((v) => (
                  <button
                    key={v}
                    type="button"
                    onClick={() => setView(v)}
                    className={`rounded-md px-2.5 py-1 text-[10.5px] font-semibold uppercase tracking-wide transition ${
                      view === v ? 'bg-white/10 text-white' : 'text-slate-500 hover:text-slate-300'
                    }`}
                  >
                    {v}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* video grid */}
          <div className="min-h-0 flex-1">
            {view === 'speaker' ? (
              <div
                className="grid h-full gap-3"
                style={{ gridTemplateColumns: 'minmax(0,1fr) 15rem' }}
              >
                <InterviewerTile />
                <div
                  className="grid gap-3"
                  style={{ gridTemplateRows: `repeat(${screen.active ? 2 : 1}, minmax(0,1fr))` }}
                >
                  {thumbs}
                </div>
              </div>
            ) : (
              <div className="grid h-full grid-cols-2 gap-3">
                <InterviewerTile />
                {thumbs}
                {!screen.active && (
                  <div className="meeting-tile flex flex-col items-center justify-center gap-2 text-center">
                    <span className="text-2xl text-slate-600">▭</span>
                    <p className="max-w-[70%] text-[12px] leading-relaxed text-slate-500">
                      Share your screen to walk the interviewer through a doc, terminal or design.
                    </p>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* captions */}
          <div className="mt-3 min-h-[52px] shrink-0">
            {caption ? (
              <div className="caption-line mx-auto max-w-3xl rounded-xl border border-white/10 bg-black/55 px-4 py-2.5 text-center backdrop-blur">
                <span className="mr-2 text-[10.5px] font-bold uppercase tracking-widest text-pulse-400">
                  {caption.who}
                </span>
                <span className="text-[13.5px] leading-relaxed text-white">{caption.text}</span>
              </div>
            ) : (
              <div className="mx-auto max-w-3xl text-center text-[11px] text-slate-600">
                {micOn
                  ? 'Live captions appear here · Alt+M mute · Alt+V camera · Alt+S share · Alt+C captions'
                  : 'Microphone is muted — unmute to answer out loud.'}
              </div>
            )}
          </div>
        </section>

        {/* resize handle */}
        <div
          role="separator"
          aria-orientation="vertical"
          className="w-1 shrink-0 cursor-col-resize bg-white/8 transition hover:bg-night-400/60"
          onPointerDown={(e) => {
            e.preventDefault();
            setDragging(true);
          }}
        />

        {/* side panel */}
        <aside className="flex min-h-0 shrink-0 flex-col border-l border-white/8 bg-black/25" style={{ width: panelWidth }}>
          <div className="flex shrink-0 items-center gap-1 border-b border-white/8 px-2 py-2">
            {TABS.map((t) => (
              <button
                key={t.id}
                type="button"
                onClick={() => setPanelTab(t.id)}
                className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-[12px] font-semibold transition ${
                  panelTab === t.id
                    ? 'bg-white/10 text-white'
                    : 'text-slate-500 hover:bg-white/5 hover:text-slate-300'
                }`}
              >
                <span className="font-mono text-[11px] opacity-70">{t.icon}</span>
                {t.label}
              </button>
            ))}
          </div>

          <div className="min-h-0 flex-1">
            {panelTab === 'chat' && <ChatPanel />}
            {panelTab === 'code' && <CodePanel />}
            {panelTab === 'board' && <Whiteboard />}
          </div>
        </aside>
      </div>

      <MeetingControls captionsOn={captionsOn} onToggleCaptions={toggleCaptions} onEnd={() => void endInterview()} />
    </div>
  );
}
