import { forwardRef, useEffect } from 'react';

interface Props {
  label: string;
  sublabel?: string;
  mirrored?: boolean;
  muted?: boolean;
  className?: string;
}

/** Self-view (webcam) or screen-share tile in the meeting grid. */
const ParticipantTile = forwardRef<HTMLVideoElement, Props>(function ParticipantTile(
  { label, sublabel, mirrored, muted, className },
  ref,
) {
  useEffect(() => {
    const video = typeof ref === 'function' ? null : ref?.current;
    if (video) void video.play().catch(() => undefined);
  }, [ref]);

  return (
    <div className={`meeting-tile ${className ?? ''}`}>
      <video
        ref={ref}
        autoPlay
        playsInline
        muted
        className={`h-full w-full object-cover ${mirrored ? '-scale-x-100' : ''}`}
      />
      <div className="pointer-events-none absolute inset-x-0 bottom-0 h-16 bg-gradient-to-t from-black/75 to-transparent" />
      <div className="absolute bottom-2.5 left-3 flex items-center gap-2">
        <span className="flex items-center gap-1.5 rounded-md bg-black/55 px-2 py-1 text-[11px] font-semibold text-white backdrop-blur">
          {muted && <span className="text-rose-400"> muted </span>}
          {label}
        </span>
        {sublabel && (
          <span className="rounded-md bg-black/45 px-2 py-1 text-[10px] text-slate-400 backdrop-blur">{sublabel}</span>
        )}
      </div>
    </div>
  );
});

export default ParticipantTile;
