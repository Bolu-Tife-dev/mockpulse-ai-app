import { useEffect, useRef } from 'react';
import { TalkingHead } from '@/services/avatar/TalkingHead';
import { tts } from '@/services/speech';
import { useInterviewStore } from '@/store/interviewStore';
import { useSettingsStore } from '@/store/settingsStore';
import type { AvatarEmotion } from '@/types';

/**
 * The interviewer window: a real-time 3D avatar rendered with Three.js.
 * Drives lip-sync from the TTS envelope, emotions from live evaluation,
 * and eye/head tracking from pointer position over the tile.
 */
export default function InterviewerTile() {
  const containerRef = useRef<HTMLDivElement>(null);
  const headRef = useRef<TalkingHead | null>(null);

  const activeEmotion = useInterviewStore((s) => s.activeEmotion);
  const speaking = useInterviewStore((s) => s.speaking);
  const thinking = useInterviewStore((s) => s.thinking);

  const avatarUrl = useSettingsStore((s) => s.settings.avatarUrl);
  const interviewerName = useSettingsStore((s) => s.settings.interviewerName);
  const interviewerTitle = useSettingsStore((s) => s.settings.interviewerTitle);
  const reactions = useSettingsStore((s) => s.settings.realtimeReactions);
  const hd = useSettingsStore((s) => s.settings.hdAvatar);

  /* Latest values for the animation loop without re-creating the scene. */
  const liveRef = useRef({ emotion: activeEmotion as AvatarEmotion, speaking, reactions });
  liveRef.current = { emotion: activeEmotion, speaking, reactions };

  const lastEmotionRef = useRef<AvatarEmotion>('neutral');

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    let head: TalkingHead | null = null;
    try {
      head = new TalkingHead(container, {
        url: avatarUrl?.trim() || undefined,
        pixelRatio: hd ? 2 : 1.25,
        onError: () => {
          /* procedural fallback head stays visible */
        },
      });
    } catch {
      return;
    }
    headRef.current = head;

    const ro = new ResizeObserver(() => head?.resize());
    ro.observe(container);

    let raf = 0;
    const loop = () => {
      raf = requestAnimationFrame(loop);
      const h = headRef.current;
      if (!h) return;

      const { emotion, speaking: sp, reactions: rx } = liveRef.current;
      h.setLevel(tts.level());
      h.setSpeaking(sp);

      const target: AvatarEmotion = rx ? emotion : 'neutral';
      if (target !== lastEmotionRef.current) {
        h.setEmotion(target, target === 'neutral' ? 900 : 2400);
        lastEmotionRef.current = target;
      }
    };
    raf = requestAnimationFrame(loop);

    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      headRef.current = null;
      head?.dispose();
    };
  }, [avatarUrl, hd]);

  const onPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
    const y = ((e.clientY - rect.top) / rect.height) * 2 - 1;
    headRef.current?.setGaze(x, -y);
  };

  const onPointerLeave = () => headRef.current?.setGaze(0, 0);

  return (
    <div
      className={`meeting-tile group ${speaking ? 'ring-2 ring-pulse-500/70' : ''}`}
      onPointerMove={onPointerMove}
      onPointerLeave={onPointerLeave}
    >
      <div ref={containerRef} className="absolute inset-0" aria-label="Interviewer video" />

      {/* studio vignette */}
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(120%_90%_at_50%_0%,transparent_35%,rgba(4,7,20,0.75)_100%)]" />

      {/* speaking indicator */}
      {speaking && (
        <div className="pointer-events-none absolute inset-x-0 bottom-0 h-1 bg-gradient-to-r from-transparent via-pulse-400 to-transparent opacity-80" />
      )}

      <div className="absolute left-3 top-3 flex items-center gap-2">
        <span className="flex items-center gap-1.5 rounded-md border border-white/10 bg-black/55 px-2 py-1 text-[11px] font-semibold text-white backdrop-blur">
          <span className={`h-1.5 w-1.5 rounded-full ${speaking ? 'bg-pulse-400 animate-pulse' : 'bg-slate-400'}`} />
          {interviewerName}
        </span>
        <span className="hidden rounded-md bg-black/45 px-2 py-1 text-[10px] text-slate-400 backdrop-blur sm:block">
          {interviewerTitle}
        </span>
      </div>

      <div className="absolute right-3 top-3 flex items-center gap-2">
        {thinking && !speaking && (
          <span className="flex items-center gap-1.5 rounded-md border border-amber-400/25 bg-amber-400/15 px-2 py-1 text-[10px] font-semibold text-amber-200 backdrop-blur">
            <span className="flex gap-0.5">
              <span className="h-1 w-1 rounded-full bg-amber-300 animate-blink" />
              <span className="h-1 w-1 rounded-full bg-amber-300 animate-blink [animation-delay:150ms]" />
              <span className="h-1 w-1 rounded-full bg-amber-300 animate-blink [animation-delay:300ms]" />
            </span>
            thinking
          </span>
        )}
        <span className="rounded-md bg-black/45 px-2 py-1 text-[10px] font-medium text-slate-300 backdrop-blur">
          LIVE
        </span>
      </div>

      {speaking && (
        <div className="absolute bottom-3 left-3 flex items-end gap-1" aria-hidden>
          {[0, 1, 2, 3, 4].map((i) => (
            <span
              key={i}
              className="w-1 rounded-full bg-pulse-400/90"
              style={{
                height: `${8 + ((i * 7) % 14)}px`,
                animation: 'pulse-ring 1s ease-in-out infinite',
                animationDelay: `${i * 90}ms`,
              }}
            />
          ))}
        </div>
      )}
    </div>
  );
}
