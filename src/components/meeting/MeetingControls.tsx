import { useEffect, useState } from 'react';
import { useInterviewStore } from '@/store/interviewStore';
import { STAGE_LABELS } from '@/services/ai/prompts';

interface Props {
  captionsOn: boolean;
  onToggleCaptions(): void;
  onEnd(): void;
}

function ControlButton({
  onClick,
  active,
  danger,
  label,
  hint,
  children,
}: {
  onClick(): void;
  active?: boolean;
  danger?: boolean;
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={hint ? `${label} · ${hint}` : label}
      aria-label={label}
      aria-pressed={active}
      className={`group relative flex h-11 w-11 items-center justify-center rounded-full border transition active:scale-95 ${
        danger
          ? 'border-rose-500/40 bg-rose-600 text-white hover:bg-rose-500'
          : active === false
            ? 'border-rose-500/35 bg-rose-500/15 text-rose-300 hover:bg-rose-500/25'
            : 'border-white/12 bg-white/[0.07] text-slate-100 hover:border-white/25 hover:bg-white/[0.13]'
      }`}
    >
      {children}
    </button>
  );
}

export default function MeetingControls({ captionsOn, onToggleCaptions, onEnd }: Props) {
  const micOn = useInterviewStore((s) => s.micOn);
  const camOn = useInterviewStore((s) => s.camOn);
  const screenShare = useInterviewStore((s) => s.screenShare);
  const audioMuted = useInterviewStore((s) => s.audioMuted);
  const stage = useInterviewStore((s) => s.stage);
  const config = useInterviewStore((s) => s.config);

  const toggleMic = useInterviewStore((s) => s.toggleMic);
  const toggleCam = useInterviewStore((s) => s.toggleCam);
  const toggleScreen = useInterviewStore((s) => s.toggleScreen);
  const toggleAudio = useInterviewStore((s) => s.toggleAudio);

  const [seconds, setSeconds] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setSeconds((s) => s + 1), 1000);
    return () => clearInterval(t);
  }, []);

  const mm = String(Math.floor(seconds / 60)).padStart(2, '0');
  const ss = String(seconds % 60).padStart(2, '0');
  const stageIndex = config.stages.indexOf(stage) + 1;

  return (
    <div className="relative z-20 flex shrink-0 items-center justify-between gap-4 border-t border-white/8 bg-black/35 px-5 py-3 backdrop-blur-xl">
      {/* left: session info */}
      <div className="flex min-w-0 items-center gap-3">
        <span className="flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3 py-1.5 text-xs font-medium text-slate-300">
          <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-rose-500" />
          <span className="tabular-nums">
            {mm}:{ss}
          </span>
        </span>
        <span className="hidden truncate text-xs text-slate-500 md:block">
          Stage {stageIndex}/{config.stages.length} · {STAGE_LABELS[stage]}
        </span>
      </div>

      {/* center: glass controls */}
      <div className="flex items-center gap-2.5 rounded-full border border-white/12 bg-white/[0.06] px-3 py-2 shadow-glass backdrop-blur-glass">
        <ControlButton onClick={toggleMic} active={micOn} label={micOn ? 'Mute microphone' : 'Unmute microphone'} hint="M">
          {micOn ? (
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round">
              <rect x="9" y="2.5" width="6" height="11" rx="3" />
              <path d="M5 11a7 7 0 0 0 14 0M12 18v3.5" />
            </svg>
          ) : (
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round">
              <path d="M9 5a3 3 0 0 1 6 0v5m-6 0v-.5M5 11a7 7 0 0 0 11.3 5.5M19 11a7 7 0 0 1-.6 2.8M12 18v3.5M4 4l16 16" />
            </svg>
          )}
        </ControlButton>

        <ControlButton onClick={toggleCam} active={camOn} label={camOn ? 'Stop camera' : 'Start camera'} hint="V">
          {camOn ? (
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinejoin="round">
              <rect x="2.5" y="6" width="13" height="12" rx="2.5" />
              <path d="M15.5 10.5 21.5 7v10l-6-3.5z" />
            </svg>
          ) : (
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinejoin="round">
              <path d="M15.5 10.5 21.5 7v10l-6-3.5zM2.5 6.5h11a2 2 0 0 1 2 2v7a2 2 0 0 1-2 2h-11z" />
              <path d="M3 3l18 18" />
            </svg>
          )}
        </ControlButton>

        <ControlButton onClick={toggleScreen} active={screenShare} label={screenShare ? 'Stop sharing' : 'Share screen'} hint="S">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
            <rect x="2.5" y="4.5" width="19" height="13" rx="2" />
            <path d="M8 21h8M12 17.5V21M12 8.5v5M9.5 11 12 8.5 14.5 11" />
          </svg>
        </ControlButton>

        <div className="mx-0.5 h-6 w-px bg-white/12" />

        <ControlButton onClick={toggleAudio} active={!audioMuted} label={audioMuted ? 'Unmute interviewer' : 'Mute interviewer'}>
          {audioMuted ? (
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
              <path d="M11 5 6.5 9H3v6h3.5L11 19zM16 9.5l4 5M20 9.5l-4 5" />
            </svg>
          ) : (
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
              <path d="M11 5 6.5 9H3v6h3.5L11 19zM15 9.2a4 4 0 0 1 0 5.6M17.8 6.6a8 8 0 0 1 0 10.8" />
            </svg>
          )}
        </ControlButton>

        <ControlButton onClick={onToggleCaptions} active={captionsOn} label={captionsOn ? 'Hide captions' : 'Show captions'} hint="C">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round">
            <rect x="2.5" y="5" width="19" height="14" rx="3" />
            <path d="M8.5 11.5a2.5 2.5 0 1 0 0 3M16.5 11.5a2.5 2.5 0 1 0 0 3" />
          </svg>
        </ControlButton>
      </div>

      {/* right: leave */}
      <button type="button" onClick={onEnd} className="btn-danger !rounded-full !px-5" title="End interview and generate report">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
          <path d="M12 9c-1.6 0-3.15.25-4.6.72v3.1c0 .39-.23.74-.56.9-.98.49-1.87 1.12-2.66 1.85-.18.18-.43.28-.7.28-.28 0-.53-.11-.71-.29L.29 13.08a.98.98 0 0 1-.29-.7c0-.28.11-.53.29-.71C3.34 8.78 7.46 7 12 7s8.66 1.78 11.71 4.67c.18.18.29.43.29.71 0 .27-.11.52-.29.7l-2.48 2.48c-.18.18-.43.29-.71.29-.27 0-.52-.1-.7-.28a11.27 11.27 0 0 0-2.67-1.85.99.99 0 0 1-.55-.9v-3.1C15.15 9.25 13.6 9 12 9z" />
        </svg>
        Leave
      </button>
    </div>
  );
}
