import { resolveSecret } from './ai/client';
import type { TTSEngine } from '@/types';

/* ========================================================================== */
/*  TEXT → SPEECH                                                             */
/* ========================================================================== */

export interface SpeakOptions {
  voiceURI?: string;
  rate?: number;
  pitch?: number;
  lang?: string;
  onBoundary?: (charIndex: number) => void;
  onStart?: () => void;
  onEnd?: (interrupted: boolean) => void;
  onError?: (err: Error) => void;
}

export interface SpeechHandle {
  /** 0..1 synthetic mouth-openness driven by pronunciation heuristics. */
  level(): number;
  speaking(): boolean;
  stop(): void;
}

const VOWELS = /[aeiouy]/i;
const CLOSE_CHARS = new Set(['m', 'b', 'p', 'f', 'v']);

/**
 * Web Speech API has no audio tap, so we synthesise a plausible viseme envelope:
 *  - a syllable-ish envelope driven by vowel density
 *  - mouth closure on bilabials (m/b/p)
 *  - hard closure on sentence-final punctuation
 *  - ramps at start/end
 * This produces convincing lip-sync for the 3D avatar.
 */
class Envelope {
  private t0 = 0;
  private text = '';
  private idx = 0;
  private active = false;
  private lastBoundary = 0;
  private readonly rate: number;

  constructor(rate: number) {
    this.rate = rate;
  }

  start(text: string) {
    this.text = text;
    this.idx = 0;
    this.t0 = performance.now();
    this.lastBoundary = this.t0;
    this.active = true;
  }

  mark(index: number) {
    this.idx = index;
    this.lastBoundary = performance.now();
  }

  stop() {
    this.active = false;
  }

  level(): number {
    if (!this.active) return 0;
    const now = performance.now();

    // Silence gap detection: taper when no boundary arrives, but keep a floor
    // while the utterance is still active (some voices emit no boundary events).
    const sinceMark = now - this.lastBoundary;
    const base = Math.max(0.28, 1 - sinceMark / 900);

    const char = (this.text[this.idx] || '').toLowerCase();
    if (CLOSE_CHARS.has(char)) return 0.04;

    // Scan forward a small window to estimate phoneme openness.
    let window = 0;
    let count = 0;
    for (let i = this.idx; i < Math.min(this.idx + 6, this.text.length); i++) {
      const c = this.text[i].toLowerCase();
      count++;
      if (VOWELS.test(c)) window += 1;
      if (',;:'.includes(c)) window += 0.4;
      if ('.!?'.includes(c)) window -= 0.8;
    }
    const openness = count ? window / count : 0.4;

    const tick = (now - this.t0) / 1000;
    // Multi-sine "speech-ish" modulation (~4–7 Hz syllable rate).
    const mod =
      0.55 +
      0.22 * Math.sin(tick * 2 * Math.PI * 4.6 * this.rate) +
      0.16 * Math.sin(tick * 2 * Math.PI * 6.9 * this.rate + 1.1) +
      0.1 * Math.sin(tick * 2 * Math.PI * 2.3 * this.rate + 2.4);

    const ramp = Math.min(1, (now - this.t0) / 120);
    return Math.max(0, Math.min(1, openness * mod * base * ramp));
  }
}

let cachedVoices: SpeechSynthesisVoice[] = [];

export function loadVoices(): Promise<SpeechSynthesisVoice[]> {
  if (typeof speechSynthesis === 'undefined') return Promise.resolve([]);
  const existing = speechSynthesis.getVoices();
  if (existing.length) {
    cachedVoices = existing;
    return Promise.resolve(existing);
  }
  return new Promise((resolve) => {
    const timer = setTimeout(() => resolve(cachedVoices), 1200);
    speechSynthesis.onvoiceschanged = () => {
      cachedVoices = speechSynthesis.getVoices();
      clearTimeout(timer);
      resolve(cachedVoices);
    };
  });
}

export function listVoices(): SpeechSynthesisVoice[] {
  return cachedVoices;
}

export function pickVoice(preferredURI?: string): SpeechSynthesisVoice | undefined {
  if (!cachedVoices.length) cachedVoices = typeof speechSynthesis !== 'undefined' ? speechSynthesis.getVoices() : [];
  if (preferredURI) {
    const exact = cachedVoices.find((v) => v.voiceURI === preferredURI);
    if (exact) return exact;
  }
  const en = cachedVoices.filter((v) => v.lang.toLowerCase().startsWith('en'));
  const preferred = en.find((v) => /natural|neural|google|online/i.test(v.name));
  return preferred || en[0] || cachedVoices[0];
}

class WebSpeechTTS {
  readonly engine = 'webspeech' as const;
  private handle: SpeechHandle | null = null;

  supported(): boolean {
    return typeof window !== 'undefined' && 'speechSynthesis' in window;
  }

  speak(text: string, opts: SpeakOptions = {}): SpeechHandle {
    const env = new Envelope(opts.rate ?? 1);
    let stopped = false;

    if (!this.supported()) {
      const timer = setTimeout(() => opts.onEnd?.(false), 400);
      const fallback: SpeechHandle = {
        level: () => 0.35,
        speaking: () => !!timer,
        stop: () => clearTimeout(timer),
      };
      opts.onStart?.();
      return fallback;
    }

    speechSynthesis.cancel();
    const utter = new SpeechSynthesisUtterance(text);
    const voice = pickVoice(opts.voiceURI);
    if (voice) {
      utter.voice = voice;
      utter.lang = voice.lang;
    }
    utter.rate = opts.rate ?? 1;
    utter.pitch = opts.pitch ?? 1;
    utter.volume = 1;

    utter.onstart = () => {
      env.start(text);
      opts.onStart?.();
    };
    utter.onboundary = (e) => {
      env.mark(e.charIndex ?? 0);
      opts.onBoundary?.(e.charIndex ?? 0);
    };
    utter.onend = () => {
      env.stop();
      if (!stopped) opts.onEnd?.(false);
    };
    utter.onerror = (e) => {
      env.stop();
      if (e.error !== 'canceled' && e.error !== 'interrupted') {
        opts.onError?.(new Error(String(e.error)));
      }
      if (!stopped) opts.onEnd?.(stopped);
    };

    speechSynthesis.speak(utter);
    // Chrome needs a kick when the utterance queue was empty.
    setTimeout(() => {
      if (speechSynthesis.paused) speechSynthesis.resume();
    }, 60);

    const handle: SpeechHandle = {
      level: () => env.level(),
      speaking: () => speechSynthesis.speaking && !stopped,
      stop: () => {
        stopped = true;
        env.stop();
        try {
          speechSynthesis.cancel();
        } catch {
          /* ignore */
        }
        opts.onEnd?.(true);
      },
    };
    this.handle = handle;
    return handle;
  }

  stop() {
    this.handle?.stop();
    try {
      speechSynthesis.cancel();
    } catch {
      /* ignore */
    }
  }
}

/**
 * `edge-tts` fallback. Electron has no bundled edge-tts, so we expect a local
 * edge-tts helper endpoint (default http://127.0.0.1:8765/tts) started with
 * `edge-tts --host`. If unreachable we transparently drop back to Web Speech.
 */
class EdgeTTS {
  readonly engine = 'edge-tts' as const;
  private audio: HTMLAudioElement | null = null;

  constructor(private readonly endpoint = 'http://127.0.0.1:8765/tts') {}

  async speak(text: string, opts: SpeakOptions = {}): Promise<SpeechHandle> {
    let level = 0;
    let active = true;
    try {
      const res = await fetch(this.endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text, voice: opts.voiceURI || 'en-US-AriaNeural', rate: opts.rate ?? 1 }),
      });
      if (!res.ok) throw new Error(`edge-tts ${res.status}`);
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const audio = new Audio(url);
      this.audio = audio;
      audio.playbackRate = opts.rate ?? 1;
      opts.onStart?.();

      audio.ontimeupdate = () => {
        // Drive the envelope from a cheap synthetic oscillator while playing.
        level = 0.3 + 0.4 * Math.abs(Math.sin(performance.now() / 90));
      };
      audio.onended = () => {
        active = false;
        level = 0;
        URL.revokeObjectURL(url);
        opts.onEnd?.(false);
      };
      await audio.play();

      return {
        level: () => level,
        speaking: () => active,
        stop: () => {
          active = false;
          audio.pause();
          URL.revokeObjectURL(url);
          opts.onEnd?.(true);
        },
      };
    } catch (err) {
      opts.onError?.(err instanceof Error ? err : new Error(String(err)));
      return new WebSpeechTTS().speak(text, opts);
    }
  }

  stop() {
    this.audio?.pause();
  }
}

export type TTSHandle = SpeechHandle;

export class SpeechSynthesizer {
  private web = new WebSpeechTTS();
  private edge = new EdgeTTS();
  private current: SpeechHandle | null = null;
  engine: TTSEngine = 'webspeech';

  configure(engine: TTSEngine) {
    this.engine = engine;
  }

  speak(text: string, opts: SpeakOptions = {}): SpeechHandle {
    this.stop();
    if (this.engine === 'edge-tts' && this.edge) {
      void this.edge.speak(text, opts).then((h) => (this.current = h));
      const proxy: SpeechHandle = {
        level: () => this.current?.level() ?? 0,
        speaking: () => this.current?.speaking() ?? false,
        stop: () => this.current?.stop(),
      };
      return proxy;
    }
    const h = this.web.speak(text, opts);
    this.current = h;
    return h;
  }

  stop() {
    this.web.stop();
    this.edge.stop();
    this.current = null;
  }

  level(): number {
    return this.current?.level() ?? 0;
  }
}

export const tts = new SpeechSynthesizer();

/* ========================================================================== */
/*  SPEECH → TEXT                                                             */
/* ========================================================================== */

export interface STTResult {
  text: string;
  engine: 'webspeech' | 'groq-whisper';
  confidence?: number;
}

export function webspeechSupported(): boolean {
  return typeof window !== 'undefined' && !!((window as unknown as Record<string, unknown>).SpeechRecognition ||
    (window as unknown as Record<string, unknown>).webkitSpeechRecognition);
}

export class SpeechRecognizer {
  private rec: Recognition | null = null;
  private media: MediaRecorder | null = null;
  private chunks: Blob[] = [];

  /* ------------------------------- Web Speech ------------------------------ */

  listenWebSpeech(handlers: {
    onPartial: (text: string) => void;
    onFinal: (text: string) => void;
    onError: (err: Error) => void;
    onEnd: () => void;
  }): () => void {
    const Ctor =
      (window as unknown as Record<string, unknown>).SpeechRecognition ||
      (window as unknown as Record<string, unknown>).webkitSpeechRecognition;

    if (!Ctor) {
      handlers.onError(new Error('Web Speech API unavailable in this build.'));
      handlers.onEnd();
      return () => undefined;
    }

    const rec = new (Ctor as new () => Recognition)();
    this.rec = rec;
    rec.continuous = true;
    rec.interimResults = true;
    rec.lang = navigator.language || 'en-US';

    let finalText = '';

    rec.onresult = (e: RecognitionEvent) => {
      let interim = '';
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const r = e.results[i];
        if (r.isFinal) finalText += `${r[0].transcript} `;
        else interim += r[0].transcript;
      }
      if (interim) handlers.onPartial((finalText + interim).trim());
      if (finalText.trim()) handlers.onFinal(finalText.trim());
    };
    rec.onerror = (e: RecognitionErrorEvent) => {
      if (e.error !== 'no-speech' && e.error !== 'aborted') {
        handlers.onError(new Error(e.error));
      }
    };
    rec.onend = () => handlers.onEnd();

    try {
      rec.start();
    } catch (err) {
      handlers.onError(err instanceof Error ? err : new Error(String(err)));
    }

    return () => {
      try {
        rec.stop();
      } catch {
        /* ignore */
      }
      this.rec = null;
    };
  }

  /* --------------------------- Groq Whisper fallback ----------------------- */

  async transcribeWithWhisper(
    stream: MediaStream,
    opts: { language?: string; signal?: AbortSignal } = {},
  ): Promise<STTResult> {
    const key = await resolveSecret('groq');
    if (!key) throw new Error('Groq API key required for Whisper transcription. Add it in Settings.');

    const blob = await this.record(stream, 8000, opts.signal);
    const wav = await audioBufferToWav(blob);

    const form = new FormData();
    form.append('file', wav, 'speech.wav');
    form.append('model', 'whisper-large-v3');
    form.append('response_format', 'json');
    form.append('temperature', '0');
    if (opts.language) form.append('language', opts.language.slice(0, 2));

    const res = await fetch('https://api.groq.com/openai/v1/audio/transcriptions', {
      method: 'POST',
      headers: { Authorization: `Bearer ${key}` },
      body: form,
      signal: opts.signal,
    });

    if (!res.ok) {
      const detail = await res.text().catch(() => '');
      throw new Error(`Whisper ${res.status}: ${detail.slice(0, 200)}`);
    }

    const data = (await res.json()) as { text?: string };
    return { text: (data.text || '').trim(), engine: 'groq-whisper' };
  }

  private record(stream: MediaStream, ms: number, signal?: AbortSignal): Promise<Blob> {
    return new Promise((resolve, reject) => {
      if (typeof MediaRecorder === 'undefined') {
        reject(new Error('MediaRecorder unavailable.'));
        return;
      }
      this.chunks = [];
      const mime = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4'].find((t) => MediaRecorder.isTypeSupported(t));
      const rec = new MediaRecorder(stream, mime ? { mimeType: mime } : undefined);
      this.media = rec;
      rec.ondataavailable = (e) => e.data.size && this.chunks.push(e.data);
      rec.onerror = () => reject(new Error('Recording failed.'));
      rec.onstop = () => {
        resolve(new Blob(this.chunks, { type: mime || 'audio/webm' }));
      };
      rec.start();
      const timer = setTimeout(() => rec.state !== 'inactive' && rec.stop(), ms);
      signal?.addEventListener('abort', () => {
        clearTimeout(timer);
        if (rec.state !== 'inactive') rec.stop();
      });
    });
  }

  stop() {
    try {
      this.rec?.stop();
    } catch {
      /* ignore */
    }
    try {
      if (this.media && this.media.state !== 'inactive') this.media.stop();
    } catch {
      /* ignore */
    }
  }
}

export const stt = new SpeechRecognizer();

/* ------------------------------- WAV encoder ------------------------------- */

async function audioBufferToWav(blob: Blob): Promise<Blob> {
  const arrayBuf = await blob.arrayBuffer();
  const ctx = new (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)();
  const decoded = await ctx.decodeAudioData(arrayBuf.slice(0));
  const channel = decoded.getChannelData(0);
  const sampleRate = 16000;
  const resampled = resampleLinear(channel, decoded.sampleRate, sampleRate);

  const buffer = new ArrayBuffer(44 + resampled.length * 2);
  const view = new DataView(buffer);
  const writeStr = (offset: number, s: string) => {
    for (let i = 0; i < s.length; i++) view.setUint8(offset + i, s.charCodeAt(i));
  };

  writeStr(0, 'RIFF');
  view.setUint32(4, 36 + resampled.length * 2, true);
  writeStr(8, 'WAVE');
  writeStr(12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  writeStr(36, 'data');
  view.setUint32(40, resampled.length * 2, true);

  let offset = 44;
  for (let i = 0; i < resampled.length; i++, offset += 2) {
    const s = Math.max(-1, Math.min(1, resampled[i]));
    view.setInt16(offset, s < 0 ? s * 0x8000 : s * 0x7fff, true);
  }

  void ctx.close();
  return new Blob([buffer], { type: 'audio/wav' });
}

function resampleLinear(input: Float32Array, from: number, to: number): Float32Array {
  if (from === to) return input;
  const ratio = from / to;
  const outLength = Math.floor(input.length / ratio);
  const out = new Float32Array(outLength);
  for (let i = 0; i < outLength; i++) {
    const pos = i * ratio;
    const left = Math.floor(pos);
    const right = Math.min(left + 1, input.length - 1);
    const frac = pos - left;
    out[i] = input[left] * (1 - frac) + input[right] * frac;
  }
  return out;
}

/* ------------------------- SpeechRecognition typings ------------------------ */

interface RecognitionResult {
  isFinal: boolean;
  0: { transcript: string };
}
interface RecognitionEvent {
  resultIndex: number;
  results: { length: number } & { [i: number]: RecognitionResult };
}
interface RecognitionErrorEvent {
  error: string;
}
interface Recognition {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  onresult: ((e: RecognitionEvent) => void) | null;
  onerror: ((e: RecognitionErrorEvent) => void) | null;
  onend: (() => void) | null;
  start(): void;
  stop(): void;
}
