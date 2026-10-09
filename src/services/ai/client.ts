import type { AppSettings, LLMProvider } from '@/types';
import { DEFAULT_MODELS, modelIds } from './models';

export class AIError extends Error {
  constructor(
    message: string,
    readonly status?: number,
    readonly provider?: LLMProvider,
    /** Raw provider message, without any local decoration — used for
     *  classification so our own "(model: …)" suffix can't skew matching. */
    readonly detail?: string,
  ) {
    super(message);
    this.name = 'AIError';
  }
}

export interface ChatRole {
  role: 'user' | 'assistant' | 'system';
  content: string;
}

export interface CompletionResult {
  text: string;
  latencyMs: number;
  tokens?: number;
}

export interface LLMClient {
  readonly provider: LLMProvider;
  readonly availableModels: string[];
  complete(messages: ChatRole[], opts?: { json?: boolean; signal?: AbortSignal }): Promise<CompletionResult>;
}

const GEMINI_BASE = 'https://generativelanguage.googleapis.com/v1beta/models';
const GROQ_BASE = 'https://api.groq.com/openai/v1';

/** The provider rejected the model itself (retired, renamed or access-limited). */
function isModelUnavailable(err: AIError): boolean {
  if (!err.status || err.status === 401 || err.status === 403) return false;
  if (err.status !== 400 && err.status !== 404 && err.status !== 410) return false;
  const text = err.detail ?? err.message;
  return /(model|not found|no longer|decommission|deprecated|unsupported|does not exist|not available|not supported)/i.test(
    text,
  );
}

/** The model is fine but refuses JSON-mode, so we retry and parse prose instead. */
function isJsonModeUnsupported(err: AIError): boolean {
  if (err.status !== 400) return false;
  const text = err.detail ?? err.message;
  return /(response_format|response_mime|json_object|json mode|structured output|does not support)/i.test(text);
}

/**
 * Runs `request`, falling back to the provider default when the selected model
 * has been retired/restricted, and dropping JSON-mode when a model rejects it.
 * Settings are left untouched — the Settings dialog reconciles the list itself.
 */
async function withModelFallbacks(
  provider: LLMProvider,
  preferredModel: string,
  json: boolean,
  request: (model: string, json: boolean) => Promise<CompletionResult>,
): Promise<CompletionResult> {
  let model = preferredModel || DEFAULT_MODELS[provider];
  let wantJson = json;
  const fallback = DEFAULT_MODELS[provider];

  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      return await request(model, wantJson);
    } catch (err) {
      if (err instanceof AIError && model !== fallback && isModelUnavailable(err)) {
        model = fallback;
      } else if (err instanceof AIError && wantJson && isJsonModeUnsupported(err)) {
        wantJson = false;
      } else {
        throw err;
      }
    }
  }
  throw new AIError(`${provider}: no compatible model available. Try another model in Settings.`, 400, provider);
}

/** Persisted secrets come from the Electron keychain; a `VITE_` fallback lets
 *  `npm run dev` work in a plain browser tab. */
export async function resolveSecret(account: string): Promise<string | null> {
  if (window.mockpulse?.keytar) {
    try {
      const v = await window.mockpulse.keytar.getPassword(account);
      if (v) return v;
    } catch {
      /* fall through */
    }
  }
  const envName = `VITE_${account.toUpperCase()}_API_KEY`;
  const fromEnv = (import.meta as unknown as Record<string, Record<string, string>>).env?.[envName];
  return fromEnv || null;
}

export async function storeSecret(account: string, value: string): Promise<void> {
  if (window.mockpulse?.keytar) {
    await window.mockpulse.keytar.setPassword(account, value);
    return;
  }
  localStorage.setItem(`mp_secret_${account}`, value);
}

export async function deleteSecret(account: string): Promise<void> {
  if (window.mockpulse?.keytar) {
    await window.mockpulse.keytar.deletePassword(account);
    return;
  }
  localStorage.removeItem(`mp_secret_${account}`);
}

function apiKeyFor(settings: AppSettings): Promise<string | null> {
  return resolveSecret(settings.provider);
}

/* -------------------------------------------------------------------------- */
/* Google Gemini                                                              */
/* -------------------------------------------------------------------------- */

class GeminiClient implements LLMClient {
  readonly provider = 'gemini' as const;
  readonly availableModels = modelIds('gemini');

  constructor(private readonly settings: AppSettings) {}

  async complete(messages: ChatRole[], opts: { json?: boolean; signal?: AbortSignal } = {}): Promise<CompletionResult> {
    const preferred = this.settings.model || this.settings.geminiModel || DEFAULT_MODELS.gemini;
    return withModelFallbacks(this.provider, preferred, !!opts.json, (model, json) =>
      this.request(messages, opts, model, json),
    );
  }

  private async request(
    messages: ChatRole[],
    opts: { json?: boolean; signal?: AbortSignal },
    model: string,
    json: boolean,
  ): Promise<CompletionResult> {
    const key = await apiKeyFor(this.settings);
    if (!key) throw new AIError('Missing Google Gemini API key. Open Settings and paste your free key.', 401, 'gemini');

    const system = messages.filter((m) => m.role === 'system').map((m) => m.content).join('\n\n');
    const history = messages.filter((m) => m.role !== 'system');

    const contents = history.map((m) => ({
      role: m.role === 'assistant' ? 'model' : 'user',
      parts: [{ text: m.content }],
    }));

    const body = {
      contents,
      ...(system ? { systemInstruction: { parts: [{ text: system }] } } : {}),
      generationConfig: {
        temperature: this.settings.temperature,
        maxOutputTokens: 4096,
        ...(json ? { responseMimeType: 'application/json' } : {}),
      },
    };

    const started = performance.now();
    const res = await fetch(`${GEMINI_BASE}/${model}:generateContent?key=${encodeURIComponent(key)}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: opts.signal,
    });

    const latencyMs = Math.round(performance.now() - started);

    if (!res.ok) {
      const body = await res.text().catch(() => '');
      const reason = extractErrorMessage(body) || res.statusText;
      throw new AIError(`Gemini ${res.status}: ${reason} (model: ${model})`, res.status, 'gemini', reason);
    }

    const data = await res.json();
    const text: string = data?.candidates?.[0]?.content?.parts?.map((p: { text?: string }) => p.text ?? '').join('') ?? '';
    if (!text) throw new AIError('Gemini returned an empty response.', 502, 'gemini');

    return { text, latencyMs, tokens: data?.usageMetadata?.totalTokenCount };
  }
}

/* -------------------------------------------------------------------------- */
/* Groq (OpenAI-compatible)                                                   */
/* -------------------------------------------------------------------------- */

class GroqClient implements LLMClient {
  readonly provider = 'groq' as const;
  readonly availableModels = modelIds('groq');

  constructor(private readonly settings: AppSettings) {}

  async complete(messages: ChatRole[], opts: { json?: boolean; signal?: AbortSignal } = {}): Promise<CompletionResult> {
    const preferred = this.settings.model || this.settings.groqModel || DEFAULT_MODELS.groq;
    return withModelFallbacks(this.provider, preferred, !!opts.json, (model, json) =>
      this.request(messages, opts, model, json),
    );
  }

  private async request(
    messages: ChatRole[],
    opts: { json?: boolean; signal?: AbortSignal },
    model: string,
    json: boolean,
  ): Promise<CompletionResult> {
    const key = await apiKeyFor(this.settings);
    if (!key) throw new AIError('Missing Groq API key. Open Settings and paste your free key.', 401, 'groq');

    const started = performance.now();

    const res = await fetch(`${GROQ_BASE}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${key}`,
      },
      body: JSON.stringify({
        model,
        temperature: this.settings.temperature,
        max_tokens: 4096,
        messages,
        ...(json
          ? { response_format: { type: 'json_object' } }
          : {}),
      }),
      signal: opts.signal,
    });

    const latencyMs = Math.round(performance.now() - started);

    if (!res.ok) {
      const body = await res.text().catch(() => '');
      const reason = extractErrorMessage(body) || res.statusText;
      throw new AIError(`Groq ${res.status}: ${reason} (model: ${model})`, res.status, 'groq', reason);
    }

    const data = await res.json();
    const text: string = data?.choices?.[0]?.message?.content ?? '';
    if (!text) throw new AIError('Groq returned an empty response.', 502, 'groq');

    return { text, latencyMs, tokens: data?.usage?.total_tokens };
  }
}

function extractErrorMessage(raw: string): string {
  if (!raw) return '';
  try {
    const parsed = JSON.parse(raw);
    return parsed?.error?.message || parsed?.[0]?.error?.message || '';
  } catch {
    return raw.slice(0, 300);
  }
}

export function createClient(settings: AppSettings): LLMClient {
  return settings.provider === 'groq' ? new GroqClient(settings) : new GeminiClient(settings);
}

/* -------------------------------------------------------------------------- */
/* Robust JSON extraction (models occasionally wrap output in prose/fences)    */
/* -------------------------------------------------------------------------- */

export function parseStructured<T>(raw: string): T {
  let text = raw.trim();

  const fence = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fence) text = fence[1].trim();

  try {
    return JSON.parse(text) as T;
  } catch {
    /* continue */
  }

  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start !== -1 && end > start) {
    try {
      return JSON.parse(text.slice(start, end + 1)) as T;
    } catch {
      /* continue */
    }
  }

  const arrStart = text.indexOf('[');
  const arrEnd = text.lastIndexOf(']');
  if (arrStart !== -1 && arrEnd > arrStart) {
    try {
      return JSON.parse(text.slice(arrStart, arrEnd + 1)) as T;
    } catch {
      /* continue */
    }
  }

  throw new AIError('Model did not return valid JSON.');
}
