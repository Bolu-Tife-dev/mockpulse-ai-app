interface ScoreRingProps {
  value: number;
  size?: number;
  stroke?: number;
  label?: string;
  sublabel?: string;
}

export function scoreColor(v: number): string {
  if (v >= 85) return '#38f2c6';
  if (v >= 70) return '#4670ff';
  if (v >= 55) return '#f5b544';
  return '#fb7185';
}

export default function ScoreRing({ value, size = 132, stroke = 11, label, sublabel }: ScoreRingProps) {
  const clamped = Math.max(0, Math.min(100, value));
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const offset = c - (clamped / 100) * c;
  const color = scoreColor(clamped);

  return (
    <div className="relative" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="rgba(255,255,255,0.08)" strokeWidth={stroke} />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke={color}
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={c}
          strokeDashoffset={offset}
          style={{ transition: 'stroke-dashoffset 1.1s cubic-bezier(.22,1,.36,1)' }}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="font-display text-3xl font-bold tabular-nums text-white">{Math.round(clamped)}</span>
        {label && <span className="text-[10px] font-semibold uppercase tracking-widest text-slate-400">{label}</span>}
        {sublabel && <span className="mt-0.5 text-[10px] text-slate-500">{sublabel}</span>}
      </div>
    </div>
  );
}
