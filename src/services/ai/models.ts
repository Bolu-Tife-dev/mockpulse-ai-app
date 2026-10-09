import type { LLMProvider } from '@/types';

export interface ModelOption {
  id: string;
  label: string;
  note?: string;
}

/**
 * Curated shortlists — verified against the live provider docs on 2026-10-09:
 *   Gemini → https://ai.google.dev/gemini-api/docs/models
 *   Groq   → https://console.groq.com/docs/models
 *
 * Retired IDs (gemini-1.5-*, mixtral-8x7b-32768) are gone, and Google now
 * access-limits the 2.5 family to keys that used them previously — so none of
 * those are offered. `fetchLiveModels()` extends these lists at runtime with
 * whatever the signed-in key can actually call, so the dropdown can't go stale.
 */
export const GEMINI_MODELS: ModelOption[] = [
  { id: 'gemini-3.8-flash', label: 'Gemini 3.8 Flash', note: 'Recommended' },
  { id: 'gemini-3.7-flash', label: 'Gemini 3.7 Flash' },
  { id: 'gemini-3.5-flash', label: 'Gemini 3.5 Flash' },
  { id: 'gemini-3.5-flash-lite', label: 'Gemini 3.5 Flash-Lite', note: 'Fastest' },
  { id: 'gemini-3.1-flash-lite', label: 'Gemini 3.1 Flash-Lite' },
  { id: 'gemini-3.1-pro-preview', label: 'Gemini 3.1 Pro', note: 'Preview · deepest reasoning' },
];

export const GROQ_MODELS: ModelOption[] = [
  { id: 'llama-3.3-70b-versatile', label: 'Llama 3.3 70B Versatile', note: 'Recommended' },
  { id: 'openai/gpt-oss-120b', label: 'GPT-OSS 120B' },
  { id: 'llama-3.1-8b-instant', label: 'Llama 3.1 8B Instant', note: 'Fastest' },
  { id: 'openai/gpt-oss-20b', label: 'GPT-OSS 20B' },
  { id: 'Qwen/Qwen3.8-27B', label: 'Qwen 3.8 27B' },
];

export const DEFAULT_MODELS: Record<LLMProvider, string> = {
  gemini: 'gemini-3.8-flash',
  groq: 'llama-3.3-70b-versatile',
};

export function modelOptions(provider: LLMProvider): ModelOption[] {
  return provider === 'groq' ? GROQ_MODELS : GEMINI_MODELS;
}

export function modelIds(provider: LLMProvider): string[] {
  return modelOptions(provider).map((m) => m.id);
}

/* ------------------------------ live discovery ----------------------------- */

interface GeminiModelInfo {
  name?: string;
  supportedGenerationMethods?: string[];
}
interface GeminiListResponse {
  models?: GeminiModelInfo[];
}
interface GroqModelInfo {
  id?: string;
}
interface GroqListResponse {
  data?: GroqModelInfo[];
}

/** Groq also lists STT/TTS/moderation models that can't answer an interview. */
const GROQ_NON_CHAT = /whisper|tts|orpheus|prompt-guard|safeguard|embedding|rerank|moderation|transcribe|compound/i;

/** Single-purpose Gemini endpoints (image / TTS / live / transcription). */
const GEMINI_NON_CHAT = /-(image|tts|live|transcribe|native-audio)/i;

function orderLikeCurated(ids: string[], provider: LLMProvider): string[] {
  const curated = modelIds(provider);
  const seen = new Set<string>();
  const merged = [
    ...curated.filter((id) => ids.includes(id)),
    ...ids.filter((id) => !curated.includes(id)).sort((a, b) => a.localeCompare(b)),
  ];
  for (const id of merged) {
    if (!seen.has(id)) seen.add(id);
  }
  return [...seen];
}

/**
 * Asks the provider which models the saved key may call. Returns `null` on any
 * failure (offline, CORS, bad key) so callers keep the curated list.
 */
export async function fetchLiveModels(provider: LLMProvider, key: string): Promise<string[] | null> {
  try {
    if (provider === 'gemini') {
      const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${encodeURIComponent(key)}`);
      if (!res.ok) return null;
      const data = (await res.json()) as GeminiListResponse;
      const ids = (data.models ?? [])
        .filter((m) => (m.supportedGenerationMethods ?? ['generateContent']).includes('generateContent'))
        .map((m) => (m.name ?? '').replace(/^models\//, ''))
        .filter((id) => id && !GEMINI_NON_CHAT.test(id));
      return ids.length ? orderLikeCurated(ids, provider) : null;
    }

    const res = await fetch('https://api.groq.com/openai/v1/models', {
      headers: { Authorization: `Bearer ${key}` },
    });
    if (!res.ok) return null;
    const data = (await res.json()) as GroqListResponse;
    const ids = (data.data ?? [])
      .map((m) => m.id ?? '')
      .filter((id) => id && !GROQ_NON_CHAT.test(id));
    return ids.length ? orderLikeCurated(ids, provider) : null;
  } catch {
    return null;
  }
}
