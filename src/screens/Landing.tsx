import { useMemo, useState } from 'react';
import { useInterviewStore, STAGES } from '@/store/interviewStore';
import { useSettingsStore } from '@/store/settingsStore';
import { useUiStore } from '@/store/uiStore';
import { SENIORITY, STAGE_LABELS, TRACK_LABELS, TRACK_SKILLS } from '@/services/ai/prompts';
import { scoreColor } from '@/components/ui/ScoreRing';
import type { InterviewStage, SeniorityLevel, TrackId } from '@/types';

const TRACKS: { id: TrackId; icon: string; skills: string[] }[] = [
  { id: 'frontend', icon: '◈', skills: ['React', 'Vue', 'Web Performance', 'CSS/DOM', 'State'] },
  { id: 'backend', icon: '⬡', skills: ['Node.js', 'Python', 'Java/Spring', 'Databases', 'System Design'] },
  { id: 'fullstack', icon: '⧉', skills: ['E2E Architecture', 'APIs', 'Auth', 'State', 'CI/CD'] },
  { id: 'general', icon: '⟡', skills: ['DS & Algos', 'OOP', 'Testing', 'Clean Code', 'Debugging'] },
];

export default function Landing() {
  const config = useInterviewStore((s) => s.config);
  const setConfig = useInterviewStore((s) => s.setConfig);
  const setCandidacy = useInterviewStore((s) => s.setCandidacy);
  const candidateName = useInterviewStore((s) => s.candidateName);
  const start = useInterviewStore((s) => s.start);
  const busy = useInterviewStore((s) => s.busy);
  const error = useInterviewStore((s) => s.error);

  const keyStatus = useSettingsStore((s) => s.keyStatus);
  const provider = useSettingsStore((s) => s.settings.provider);
  const openSettings = useUiStore((s) => s.openSettings);
  const interviewerName = useSettingsStore((s) => s.settings.interviewerName);
  const interviewerTitle = useSettingsStore((s) => s.settings.interviewerTitle);

  const [name, setName] = useState(candidateName === 'Candidate' ? '' : candidateName);

  const skills = useMemo(() => TRACK_SKILLS[config.track], [config.track]);

  const activeKeys = provider === 'gemini' ? keyStatus.gemini : keyStatus.groq;
  const ready = activeKeys === 'valid' || activeKeys === 'checking';

  const toggleFocus = (skill: string) => {
    setConfig({
      focusSkills: config.focusSkills.includes(skill)
        ? config.focusSkills.filter((s) => s !== skill)
        : [...config.focusSkills, skill],
    });
  };

  const toggleStage = (stage: InterviewStage) => {
    const has = config.stages.includes(stage);
    if (has && config.stages.length === 1) return;
    setConfig({
      stages: has ? config.stages.filter((s) => s !== stage) : [...config.stages, stage],
    });
  };

  const handleStart = async () => {
    setCandidacy(name);
    await start();
  };

  return (
    <div className="scrollbar-thin h-full overflow-y-auto px-6 py-8">
      <div className="mx-auto max-w-6xl">
        {/* Hero */}
        <div className="mb-9 animate-fade-in-up">
          <div className="mb-3 flex items-center gap-2">
            <span className="chip !border-pulse-500/30 !bg-pulse-500/10 !text-pulse-400">
              <span className="h-1.5 w-1.5 rounded-full bg-pulse-400" /> 100% free-tier APIs
            </span>
            <span className="chip">Gemini Flash</span>
            <span className="chip">Groq Llama 3.3</span>
            <span className="chip">Whisper STT</span>
          </div>
          <h1 className="text-4xl font-extrabold tracking-tight text-white sm:text-5xl">
            Interview like it&apos;s <span className="text-gradient">real</span>.
          </h1>
          <p className="mt-3 max-w-2xl text-[15px] leading-relaxed text-slate-400">
            A hyper-realistic remote technical interview with a lip-synced 3D interviewer, live Monaco
            coding, system-design whiteboard and a full scorecard — all running locally on your machine.
          </p>
        </div>

        {/* API readiness banner */}
        <div
          className={`mb-7 flex flex-wrap items-center justify-between gap-4 rounded-2xl border px-5 py-4 ${
            ready
              ? 'border-pulse-500/25 bg-pulse-500/[0.07]'
              : 'border-amber-400/25 bg-amber-400/[0.07]'
          }`}
        >
          <div className="flex items-start gap-3">
            <span
              className={`mt-1 h-2.5 w-2.5 shrink-0 rounded-full ${ready ? 'bg-pulse-400' : 'bg-amber-400'}`}
            />
            <div>
              <p className="text-sm font-semibold text-white">
                {ready
                  ? `${provider === 'gemini' ? 'Google Gemini' : 'Groq'} key detected`
                  : 'Add your free API key to begin'}
              </p>
              <p className="text-xs text-slate-400">
                {ready
                  ? 'The interviewer, evaluator and scorecard are ready.'
                  : 'Grab a free key from Google AI Studio or console.groq.com — it takes 30 seconds and costs nothing.'}
              </p>
            </div>
          </div>
          <button type="button" className="btn-ghost" onClick={openSettings}>
            Open Settings
          </button>
        </div>

        <div className="grid gap-6 lg:grid-cols-[1.55fr_1fr]">
          {/* ------------------------------ Left column ----------------------------- */}
          <div className="space-y-6">
            {/* Candidate */}
            <section className="glass p-5">
              <h2 className="mb-4 flex items-center gap-2 text-sm font-semibold uppercase tracking-widest text-slate-300">
                <span className="text-night-400">01</span> Candidate
              </h2>
              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <label className="label" htmlFor="candidate-name">Your name</label>
                  <input
                    id="candidate-name"
                    className="field"
                    placeholder="Jordan Rivera"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                  />
                </div>
                <div>
                  <label className="label" htmlFor="target-company">Target company (optional)</label>
                  <input
                    id="target-company"
                    className="field"
                    placeholder="Stripe, Google, Datadog…"
                    value={config.targetCompany}
                    onChange={(e) => setConfig({ targetCompany: e.target.value })}
                  />
                </div>
              </div>
            </section>

            {/* Track */}
            <section className="glass p-5">
              <h2 className="mb-4 flex items-center gap-2 text-sm font-semibold uppercase tracking-widest text-slate-300">
                <span className="text-night-400">02</span> Target role track
              </h2>
              <div className="grid gap-3 sm:grid-cols-2">
                {TRACKS.map((t) => {
                  const active = config.track === t.id;
                  return (
                    <button
                      key={t.id}
                      type="button"
                      onClick={() => setConfig({ track: t.id, focusSkills: [] })}
                      className={`group rounded-xl border p-4 text-left transition ${
                        active
                          ? 'border-night-400/60 bg-night-500/15 shadow-glow'
                          : 'border-white/10 bg-white/[0.03] hover:border-white/25 hover:bg-white/[0.06]'
                      }`}
                    >
                      <div className="mb-1.5 flex items-center justify-between">
                        <span className="text-lg text-night-300">{t.icon}</span>
                        <span
                          className={`h-4 w-4 rounded-full border-2 transition ${
                            active ? 'border-night-400 bg-night-400' : 'border-white/25'
                          }`}
                        />
                      </div>
                      <div className="text-sm font-semibold text-white">{TRACK_LABELS[t.id]}</div>
                      <div className="mt-1 text-[11px] leading-relaxed text-slate-500">{t.skills.join(' · ')}</div>
                    </button>
                  );
                })}
              </div>
            </section>

            {/* Seniority */}
            <section className="glass p-5">
              <h2 className="mb-4 flex items-center gap-2 text-sm font-semibold uppercase tracking-widest text-slate-300">
                <span className="text-night-400">03</span> Seniority level
              </h2>
              <div className="grid gap-3 sm:grid-cols-3">
                {(Object.keys(SENIORITY) as SeniorityLevel[]).map((lvl) => {
                  const active = config.seniority === lvl;
                  return (
                    <button
                      key={lvl}
                      type="button"
                      onClick={() => setConfig({ seniority: lvl })}
                      className={`rounded-xl border p-4 text-left transition ${
                        active
                          ? 'border-pulse-500/50 bg-pulse-500/10'
                          : 'border-white/10 bg-white/[0.03] hover:border-white/25'
                      }`}
                    >
                      <div className="text-sm font-semibold text-white">{SENIORITY[lvl].title}</div>
                      <div className="mt-0.5 text-[11px] text-slate-500">{SENIORITY[lvl].years}</div>
                      <p className="mt-2 text-[11px] leading-relaxed text-slate-400">{SENIORITY[lvl].expectations}</p>
                    </button>
                  );
                })}
              </div>
            </section>

            {/* Focus skills */}
            <section className="glass p-5">
              <div className="mb-4 flex items-center justify-between">
                <h2 className="flex items-center gap-2 text-sm font-semibold uppercase tracking-widest text-slate-300">
                  <span className="text-night-400">04</span> Focus areas
                </h2>
                <span className="text-[11px] text-slate-500">
                  {config.focusSkills.length} selected · or leave blank for a full-spectrum loop
                </span>
              </div>
              <div className="flex flex-wrap gap-2">
                {skills.map((s) => {
                  const active = config.focusSkills.includes(s);
                  return (
                    <button
                      key={s}
                      type="button"
                      onClick={() => toggleFocus(s)}
                      className={`chip transition ${
                        active
                          ? '!border-night-400/60 !bg-night-500/25 !text-night-200'
                          : 'hover:!border-white/30 hover:!bg-white/10'
                      }`}
                    >
                      {active && <span className="text-night-300">✓</span>}
                      {s}
                    </button>
                  );
                })}
              </div>
            </section>
          </div>

          {/* ----------------------------- Right column ----------------------------- */}
          <div className="space-y-6">
            {/* Stages */}
            <section className="glass p-5">
              <h2 className="mb-4 flex items-center gap-2 text-sm font-semibold uppercase tracking-widest text-slate-300">
                <span className="text-night-400">05</span> Interview stages
              </h2>
              <div className="space-y-2">
                {STAGES.map((stage, i) => {
                  const active = config.stages.includes(stage);
                  return (
                    <button
                      key={stage}
                      type="button"
                      onClick={() => toggleStage(stage)}
                      className={`flex w-full items-center gap-3 rounded-xl border px-3.5 py-3 text-left transition ${
                        active ? 'border-white/20 bg-white/[0.07]' : 'border-white/8 bg-white/[0.02] opacity-55'
                      }`}
                    >
                      <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-night-600/40 text-[11px] font-bold text-night-200">
                        {i + 1}
                      </span>
                      <span className="flex-1 text-[13px] font-medium text-white">{STAGE_LABELS[stage]}</span>
                      <span className={`h-4 w-7 rounded-full p-0.5 transition ${active ? 'bg-night-500' : 'bg-white/15'}`}>
                        <span className={`block h-3 w-3 rounded-full bg-white transition ${active ? 'translate-x-3' : ''}`} />
                      </span>
                    </button>
                  );
                })}
              </div>

              <div className="mt-5">
                <label className="label" htmlFor="duration">Time budget</label>
                <div className="flex items-center gap-3">
                  <input
                    id="duration"
                    type="range"
                    min={15}
                    max={90}
                    step={15}
                    value={config.durationMinutes}
                    onChange={(e) => setConfig({ durationMinutes: Number(e.target.value) })}
                    className="h-1.5 flex-1 cursor-pointer appearance-none rounded-full bg-white/15 accent-night-500"
                  />
                  <span className="w-16 text-right text-sm font-semibold tabular-nums text-white">
                    {config.durationMinutes}m
                  </span>
                </div>
              </div>
            </section>

            {/* Summary + start */}
            <section className="glass overflow-hidden">
              <div className="border-b border-white/10 bg-white/[0.03] px-5 py-4">
                <h3 className="text-sm font-semibold text-white">Session summary</h3>
              </div>
              <dl className="space-y-2.5 px-5 py-4 text-[13px]">
                {[
                  ['Role', TRACK_LABELS[config.track]],
                  ['Level', SENIORITY[config.seniority].title],
                  ['Stages', `${config.stages.length} of 4`],
                  ['Focus', config.focusSkills.length ? `${config.focusSkills.length} topics` : 'Full spectrum'],
                  ['Interviewer', `${interviewerName} · ${interviewerTitle}`],
                ].map(([k, v]) => (
                  <div key={k} className="flex items-center justify-between gap-3">
                    <dt className="text-slate-500">{k}</dt>
                    <dd className="font-medium text-slate-200">{v}</dd>
                  </div>
                ))}
              </dl>

              <div className="border-t border-white/10 p-5">
                <div className="mb-3 flex items-center gap-2 text-[11px] text-slate-500">
                  <span className={`h-1.5 w-1.5 rounded-full ${ready ? 'bg-pulse-400' : 'bg-amber-400'}`} />
                  Microphone and camera are requested when you join.
                </div>
                <button
                  type="button"
                  className="btn-primary w-full !py-3.5 text-[15px]"
                  onClick={() => void handleStart()}
                  disabled={busy}
                >
                  {busy ? (
                    <>
                      <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/40 border-t-white" />
                      Connecting…
                    </>
                  ) : (
                    <>
                      Join interview room
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round">
                        <path d="M5 12h14M13 6l6 6-6 6" />
                      </svg>
                    </>
                  )}
                </button>
                {error && <p className="mt-3 text-xs leading-relaxed text-rose-400">{error}</p>}
              </div>
            </section>

            {/* Track accent legend */}
            <div className="flex items-center justify-between px-1 text-[11px] text-slate-600">
              <span>Everything runs locally</span>
              <span className="flex items-center gap-1.5">
                <span className="h-1.5 w-1.5 rounded-full" style={{ background: scoreColor(85) }} />
                Keys never leave your OS keystore
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
