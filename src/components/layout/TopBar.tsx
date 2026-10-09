import { useEffect, useState } from 'react';

interface Props {
  onOpenSettings(): void;
}

export default function TopBar({ onOpenSettings }: Props) {
  const [now, setNow] = useState(() => new Date());
  const [version, setVersion] = useState('');

  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 1000);
    if (window.mockpulse) {
      void window.mockpulse.app.info().then((i) => setVersion(`v${i.version}`));
    }
    return () => clearInterval(t);
  }, []);

  return (
    <header className="relative z-30 flex h-14 shrink-0 items-center justify-between border-b border-white/8 bg-black/25 px-5 backdrop-blur-xl">
      <div className="flex items-center gap-3">
        <div className="relative flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-night-400 to-pulse-600 shadow-glow">
          <span className="text-[13px] font-black text-night-950">M</span>
          <span className="absolute -right-0.5 -top-0.5 h-2 w-2 rounded-full bg-pulse-400 animate-blink" />
        </div>
        <div className="leading-tight">
          <div className="text-[15px] font-bold tracking-tight text-white">
            MockPulse <span className="text-gradient">AI</span>
          </div>
          <div className="text-[10px] uppercase tracking-[0.2em] text-slate-500">AI Remote Technical Interviewer</div>
        </div>
      </div>

      <div className="flex items-center gap-3">
        <div className="hidden items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3 py-1.5 text-[11px] font-medium text-slate-400 md:flex">
          <span className="h-1.5 w-1.5 rounded-full bg-pulse-400 animate-pulse" />
          Local &amp; private · keys stored in OS keystore
        </div>
        <span className="hidden text-xs tabular-nums text-slate-500 sm:block">
          {now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
        </span>
        {version && <span className="chip !py-0.5 text-[10px]">{version}</span>}
        <button type="button" onClick={onOpenSettings} className="btn-ghost !px-3 !py-2" aria-label="Settings">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
            <circle cx="12" cy="12" r="3" />
            <path d="M19.4 15a1.7 1.7 0 0 0 .34 1.87l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.7 1.7 0 0 0-1.87-.34 1.7 1.7 0 0 0-1 1.55V21a2 2 0 1 1-4 0v-.09A1.7 1.7 0 0 0 8.9 19.3a1.7 1.7 0 0 0-1.87.34l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.7 1.7 0 0 0 4.55 15a1.7 1.7 0 0 0-1.55-1H3a2 2 0 1 1 0-4h.09A1.7 1.7 0 0 0 4.7 8.9a1.7 1.7 0 0 0-.34-1.87l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.7 1.7 0 0 0 9 4.55 1.7 1.7 0 0 0 10 3V3a2 2 0 1 1 4 0v.09a1.7 1.7 0 0 0 1 1.55 1.7 1.7 0 0 0 1.87-.34l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06A1.7 1.7 0 0 0 19.45 9v.09a1.7 1.7 0 0 0 1.55 1H21a2 2 0 1 1 0 4h-.09a1.7 1.7 0 0 0-1.51 1Z" />
          </svg>
          <span className="hidden sm:inline">Settings</span>
          <kbd className="hidden rounded border border-white/15 bg-white/5 px-1 text-[10px] text-slate-500 lg:inline">⌘,</kbd>
        </button>
      </div>
    </header>
  );
}
