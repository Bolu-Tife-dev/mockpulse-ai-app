import { useEffect, useMemo, useState } from 'react';
import Modal from '@/components/ui/Modal';
import { useSettingsStore, type KeyStatus } from '@/store/settingsStore';
import { useUiStore } from '@/store/uiStore';
import { listVoices, loadVoices, tts } from '@/services/speech';
import type { LLMProvider, STTEngine, TTSEngine } from '@/types';

const GEMINI_MODELS = ['gemini-2.5-flash', 'gemini-2.5-pro', 'gemini-1.5-flash', 'gemini-1.5-pro'];
const GROQ_MODELS = ['llama-3.3-70b-versatile', 'llama-3.1-8b-instant', 'mixtral-8x7b-32768'];

const KEY_HINTS: Record<'gemini' | 'groq', { label: string; url: string; placeholder: string }> = {
  gemini: {
    label: 'Google AI Studio',
    url: 'https://aistudio.google.com/app/apikey',
    placeholder: 'AIza…',
  },
  groq: {
    label: 'Groq Console',
    url: 'https://console.groq.com/keys',
    placeholder: 'gsk_…',
  },
};

const STATUS_META: Record<KeyStatus, { text: string; className: string }> = {
  unknown: { text: 'Not checked', className: 'text-slate-500' },
  checking: { text: 'Checking…', className: 'text-amber-400' },
  valid: { text: 'Connected', className: 'text-pulse-400' },
  invalid: { text: 'Rejected', className: 'text-rose-400' },
  missing: { text: 'No key saved', className: 'text-amber-400' },
};

function Section({ n, title, children }: { n: string; title: string; children: React.ReactNode }) {
  return (
    <section className="mb-7 last:mb-0">
      <h3 className="mb-3 flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">
        <span className="text-night-400">{n}</span> {title}
      </h3>
      <div className="space-y-4 rounded-xl border border-white/8 bg-white/[0.025] p-4">{children}</div>
    </section>
  );
}

function Toggle({
  checked,
  onChange,
  label,
  hint,
}: {
  checked: boolean;
  onChange(v: boolean): void;
  label: string;
  hint?: string;
}) {
  return (
    <button
      type="button"
      onClick={() => onChange(!checked)}
      className="flex w-full items-center justify-between gap-4 text-left"
    >
      <span>
        <span className="block text-[13px] font-medium text-slate-200">{label}</span>
        {hint && <span className="mt-0.5 block text-[11px] leading-relaxed text-slate-500">{hint}</span>}
      </span>
      <span className={`relative h-6 w-11 shrink-0 rounded-full transition ${checked ? 'bg-night-500' : 'bg-white/15'}`}>
        <span
          className={`absolute top-1 h-4 w-4 rounded-full bg-white shadow transition-all ${
            checked ? 'left-6' : 'left-1'
          }`}
        />
      </span>
    </button>
  );
}

export default function SettingsModal() {
  const open = useUiStore((s) => s.settingsOpen);
  const close = useUiStore((s) => s.closeSettings);

  const settings = useSettingsStore((s) => s.settings);
  const update = useSettingsStore((s) => s.update);
  const saveKey = useSettingsStore((s) => s.saveKey);
  const clearKey = useSettingsStore((s) => s.clearKey);
  const testKey = useSettingsStore((s) => s.testKey);
  const keyStatus = useSettingsStore((s) => s.keyStatus);
  const storageBackend = useSettingsStore((s) => s.storageBackend);
  const resetAll = useSettingsStore((s) => s.resetAll);

  const provider = settings.provider;
  const [drafts, setDrafts] = useState({ gemini: '', groq: '' });
  const [revealed, setRevealed] = useState(false);
  const [savedFlash, setSavedFlash] = useState<'gemini' | 'groq' | null>(null);
  const [voices, setVoices] = useState<SpeechSynthesisVoice[]>([]);
  const [confirmReset, setConfirmReset] = useState(false);

  useEffect(() => {
    if (!open) return;
    void loadVoices().then((v) => setVoices(v.length ? v : listVoices()));
  }, [open]);

  const models = provider === 'groq' ? GROQ_MODELS : GEMINI_MODELS;
  const status = keyStatus[provider];

  const voiceOptions = useMemo(
    () =>
      voices
        .filter((v) => v.lang.toLowerCase().startsWith('en'))
        .map((v) => ({ uri: v.voiceURI, label: `${v.name} · ${v.lang}` })),
    [voices],
  );

  const switchProvider = (next: LLMProvider) => {
    if (next === provider) return;
    const model = next === 'groq' ? settings.groqModel : settings.geminiModel;
    void update({
      provider: next,
      model,
      geminiModel: next === 'gemini' ? model : settings.geminiModel,
      groqModel: next === 'groq' ? model : settings.groqModel,
    });
  };

  const onSaveKey = async (account: 'gemini' | 'groq') => {
    const value = drafts[account].trim();
    if (!value) return;
    await saveKey(account, value);
    setDrafts((d) => ({ ...d, [account]: '' }));
    setSavedFlash(account);
    window.setTimeout(() => setSavedFlash(null), 1800);
  };

  const onTestVoice = () => {
    tts.configure(settings.ttsEngine);
    tts.speak('Hi, I am ready when you are. Let us begin the interview.', {
      voiceURI: settings.ttsVoice || undefined,
      rate: 1.02,
    });
  };

  return (
    <Modal
      open={open}
      onClose={close}
      title="Settings"
      subtitle="Everything here stays on your machine — keys go into the OS keystore."
      width="max-w-3xl"
      footer={
        <>
          <button type="button" className="btn-ghost mr-auto !text-rose-300" onClick={() => setConfirmReset(true)}>
            Reset everything
          </button>
          <button type="button" className="btn-primary" onClick={close}>
            Done
          </button>
        </>
      }
    >
      {/* ----------------------------- Intelligence ---------------------------- */}
      <Section n="01" title="Language model (free tier)">
        <div className="grid gap-3 sm:grid-cols-2">
          {([
            { id: 'gemini' as const, name: 'Google Gemini Flash', note: 'generativelanguage.googleapis.com' },
            { id: 'groq' as const, name: 'Groq · Llama 3.3 70B', note: 'api.groq.com' },
          ]).map((p) => (
            <button
              key={p.id}
              type="button"
              onClick={() => switchProvider(p.id)}
              className={`rounded-xl border p-3.5 text-left transition ${
                provider === p.id
                  ? 'border-night-400/60 bg-night-500/15 shadow-glow'
                  : 'border-white/10 bg-white/[0.03] hover:border-white/25'
              }`}
            >
              <div className="flex items-center justify-between">
                <span className="text-[13px] font-semibold text-white">{p.name}</span>
                <span
                  className={`h-4 w-4 rounded-full border-2 ${
                    provider === p.id ? 'border-night-400 bg-night-400' : 'border-white/25'
                  }`}
                />
              </div>
              <div className="mt-1 font-mono text-[10px] text-slate-500">{p.note}</div>
            </button>
          ))}
        </div>

        <div>
          <label className="label" htmlFor="api-key">
            {provider === 'gemini' ? 'Google AI Studio' : 'Groq'} API key
            <span className={`ml-2 normal-case tracking-normal ${STATUS_META[status].className}`}>
              · {STATUS_META[status].text}
            </span>
          </label>
          <div className="flex gap-2">
            <input
              id="api-key"
              type={revealed ? 'text' : 'password'}
              autoComplete="off"
              spellCheck={false}
              className="field font-mono"
              placeholder={`${KEY_HINTS[provider].label} — ${KEY_HINTS[provider].placeholder}`}
              value={drafts[provider]}
              onChange={(e) => setDrafts((d) => ({ ...d, [provider]: e.target.value }))}
              onKeyDown={(e) => {
                if (e.key === 'Enter') void onSaveKey(provider);
              }}
            />
            <button type="button" className="btn-ghost !px-3" onClick={() => setRevealed((r) => !r)} aria-label="Reveal key">
              {revealed ? 'Hide' : 'Show'}
            </button>
            <button
              type="button"
              className="btn-primary"
              disabled={!drafts[provider].trim()}
              onClick={() => void onSaveKey(provider)}
            >
              {savedFlash === provider ? 'Saved ✓' : 'Save key'}
            </button>
          </div>
          <div className="mt-2 flex flex-wrap items-center gap-3 text-[11px] text-slate-500">
            <a
              className="text-night-300 underline decoration-night-500/50 underline-offset-2 hover:text-night-200"
              href={KEY_HINTS[provider].url}
              target="_blank"
              rel="noreferrer"
            >
              Get a free key → {KEY_HINTS[provider].label}
            </a>
            <button type="button" className="text-slate-500 hover:text-slate-300" onClick={() => void testKey(provider)}>
              Test connection
            </button>
            <button
              type="button"
              className="text-slate-500 hover:text-rose-400"
              onClick={() => {
                void clearKey(provider);
                setDrafts((d) => ({ ...d, [provider]: '' }));
              }}
            >
              Remove saved key
            </button>
            <span className="ml-auto flex items-center gap-1.5">
              <span className="h-1.5 w-1.5 rounded-full bg-pulse-400" />
              {storageBackend === 'browser-localStorage'
                ? 'Dev mode: browser storage'
                : storageBackend === 'os-keystore'
                  ? 'Encrypted in OS keystore'
                  : 'Encrypted at rest (AES-256-GCM)'}
            </span>
          </div>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label className="label" htmlFor="model">Model</label>
            <select
              id="model"
              className="field"
              value={settings.model}
              onChange={(e) => {
                const model = e.target.value;
                void update({
                  model,
                  ...(provider === 'groq' ? { groqModel: model } : { geminiModel: model }),
                });
              }}
            >
              {models.map((m) => (
                <option key={m} value={m} className="bg-night-950">
                  {m}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="label" htmlFor="temp">
              Temperature · {settings.temperature.toFixed(2)}
            </label>
            <input
              id="temp"
              type="range"
              min={0}
              max={1}
              step={0.05}
              value={settings.temperature}
              onChange={(e) => void update({ temperature: Number(e.target.value) })}
              className="mt-3 h-1.5 w-full cursor-pointer appearance-none rounded-full bg-white/15 accent-night-500"
            />
            <p className="mt-1 text-[11px] text-slate-500">Lower = stricter interviewer. Higher = more personality.</p>
          </div>
        </div>
      </Section>

      {/* -------------------------------- Voice -------------------------------- */}
      <Section n="02" title="Voice: speech-to-text & text-to-speech">
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label className="label" htmlFor="stt">Speech-to-text engine</label>
            <select
              id="stt"
              className="field"
              value={settings.sttEngine}
              onChange={(e) => void update({ sttEngine: e.target.value as STTEngine })}
            >
              <option value="webspeech" className="bg-night-950">Web Speech API (free, built-in)</option>
              <option value="groq-whisper" className="bg-night-950">Groq Whisper large-v3 (needs Groq key)</option>
            </select>
          </div>
          <div>
            <label className="label" htmlFor="tts">Text-to-speech engine</label>
            <select
              id="tts"
              className="field"
              value={settings.ttsEngine}
              onChange={(e) => void update({ ttsEngine: e.target.value as TTSEngine })}
            >
              <option value="webspeech" className="bg-night-950">Web Speech API (free, built-in)</option>
              <option value="edge-tts" className="bg-night-950">edge-tts local bridge (localhost:8765)</option>
              <option value="silent" className="bg-night-950">Silent — captions only</option>
            </select>
          </div>
        </div>

        <div className="grid gap-4 sm:grid-cols-[1fr_auto] sm:items-end">
          <div>
            <label className="label" htmlFor="voice">Interviewer voice</label>
            <select
              id="voice"
              className="field"
              value={settings.ttsVoice}
              onChange={(e) => void update({ ttsVoice: e.target.value })}
            >
              <option value="" className="bg-night-950">Automatic (best English voice)</option>
              {voiceOptions.map((v) => (
                <option key={v.uri} value={v.uri} className="bg-night-950">
                  {v.label}
                </option>
              ))}
            </select>
          </div>
          <button type="button" className="btn-ghost" onClick={onTestVoice}>
            ▶ Preview voice
          </button>
        </div>
        <p className="text-[11px] leading-relaxed text-slate-500">
          Web Speech works offline-ish with zero setup. For hands-free accuracy, switch STT to Groq Whisper — the free
          tier handles interview-length audio easily.
        </p>
      </Section>

      {/* --------------------------- Avatar & persona -------------------------- */}
      <Section n="03" title="Interviewer avatar & persona">
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label className="label" htmlFor="iv-name">Interviewer name</label>
            <input
              id="iv-name"
              className="field"
              value={settings.interviewerName}
              onChange={(e) => void update({ interviewerName: e.target.value })}
            />
          </div>
          <div>
            <label className="label" htmlFor="iv-title">Interviewer title</label>
            <input
              id="iv-title"
              className="field"
              value={settings.interviewerTitle}
              onChange={(e) => void update({ interviewerTitle: e.target.value })}
            />
          </div>
        </div>

        <div>
          <label className="label" htmlFor="avatar-url">
            Ready Player Me GLB avatar URL <span className="normal-case tracking-normal">(optional)</span>
          </label>
          <input
            id="avatar-url"
            className="field font-mono !text-[12px]"
            placeholder="https://models.readyplayer.me/<id>.glb?morphTargets=ARKit&textureAtlas=1024"
            value={settings.avatarUrl}
            onChange={(e) => void update({ avatarUrl: e.target.value })}
          />
          <p className="mt-1.5 text-[11px] leading-relaxed text-slate-500">
            Leave blank to use the built-in procedural interviewer (works 100% offline). Paste any Ready Player Me GLB
            link to load a photorealistic head with ARKit blendshapes for lip-sync.
          </p>
        </div>

        <div className="space-y-3 pt-1">
          <Toggle
            checked={settings.realtimeReactions}
            onChange={(v) => void update({ realtimeReactions: v })}
            label="Real-time facial reactions"
            hint="Nods, smiles, thinking pauses and concerned looks driven by live answer evaluation."
          />
          <Toggle
            checked={settings.hdAvatar}
            onChange={(v) => void update({ hdAvatar: v })}
            label="HD rendering"
            hint="Renders the 3D avatar at 2× pixel density. Turn off on low-power GPUs."
          />
        </div>
      </Section>

      {/* ------------------------------- Danger -------------------------------- */}
      {confirmReset && (
        <div className="rounded-xl border border-rose-500/30 bg-rose-500/10 p-4">
          <p className="text-[13px] font-semibold text-rose-200">Reset all local data?</p>
          <p className="mt-1 text-[12px] leading-relaxed text-rose-200/70">
            This wipes settings, saved API keys and every stored report from this machine. It cannot be undone.
          </p>
          <div className="mt-3 flex gap-2">
            <button type="button" className="btn-danger" onClick={() => void resetAll()}>
              Yes, reset everything
            </button>
            <button type="button" className="btn-ghost" onClick={() => setConfirmReset(false)}>
              Cancel
            </button>
          </div>
        </div>
      )}
    </Modal>
  );
}
