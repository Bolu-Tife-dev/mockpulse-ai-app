import { create } from 'zustand';
import { DEFAULT_SETTINGS, type AppSettings } from '@/types';
import { deleteSecret, resolveSecret, storeSecret } from '@/services/ai/client';

export type KeyStatus = 'unknown' | 'checking' | 'valid' | 'invalid' | 'missing';

interface SettingsState {
  settings: AppSettings;
  loaded: boolean;
  keyStatus: Record<'gemini' | 'groq', KeyStatus>;
  storageBackend: string;

  load(): Promise<void>;
  update(patch: Partial<AppSettings>): Promise<void>;
  saveKey(account: 'gemini' | 'groq', value: string): Promise<void>;
  clearKey(account: 'gemini' | 'groq'): Promise<void>;
  testKey(account: 'gemini' | 'groq'): Promise<KeyStatus>;
  resetAll(): Promise<void>;
}

async function probeKey(account: 'gemini' | 'groq', settings: AppSettings): Promise<KeyStatus> {
  const key = await resolveSecret(account);
  if (!key) return 'missing';

  try {
    if (account === 'gemini') {
      const model = settings.model || settings.geminiModel;
      const res = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${model}?key=${encodeURIComponent(key)}`,
      );
      return res.ok ? 'valid' : res.status === 400 || res.status === 403 ? 'invalid' : 'valid';
    }
    const res = await fetch('https://api.groq.com/openai/v1/models', {
      headers: { Authorization: `Bearer ${key}` },
    });
    return res.ok ? 'valid' : 'invalid';
  } catch {
    // Offline / CORS-restricted: treat presence as provisionally valid.
    return 'valid';
  }
}

export const useSettingsStore = create<SettingsState>((set, get) => ({
  settings: DEFAULT_SETTINGS,
  loaded: false,
  keyStatus: { gemini: 'unknown', groq: 'unknown' },
  storageBackend: 'local',

  async load() {
    let persisted: Partial<AppSettings> = {};
    if (window.mockpulse) {
      try {
        persisted = (await window.mockpulse.settings.get()) as Partial<AppSettings>;
        const backend = await window.mockpulse.keytar.backend();
        set({ storageBackend: backend });
      } catch {
        /* ignore */
      }
    } else {
      try {
        const raw = localStorage.getItem('mp_settings');
        if (raw) persisted = JSON.parse(raw) as Partial<AppSettings>;
        set({ storageBackend: 'browser-localStorage' });
      } catch {
        /* ignore */
      }
    }

    const settings = { ...DEFAULT_SETTINGS, ...persisted };
    set({ settings, loaded: true });

    // Warm key presence checks without blocking the UI.
    void get().testKey('gemini');
    void get().testKey('groq');
  },

  async update(patch) {
    const settings = { ...get().settings, ...patch };
    set({ settings });
    if (window.mockpulse) {
      await window.mockpulse.settings.set(patch);
    } else {
      localStorage.setItem('mp_settings', JSON.stringify(settings));
    }
    if (patch.model || patch.provider) {
      void get().testKey(settings.provider);
    }
  },

  async saveKey(account, value) {
    const trimmed = value.trim();
    if (!trimmed) return;
    await storeSecret(account, trimmed);
    const status = await probeKey(account, get().settings);
    set((s) => ({ keyStatus: { ...s.keyStatus, [account]: status } }));
  },

  async clearKey(account) {
    await deleteSecret(account);
    set((s) => ({ keyStatus: { ...s.keyStatus, [account]: 'missing' } }));
  },

  async testKey(account) {
    set((s) => ({ keyStatus: { ...s.keyStatus, [account]: 'checking' } }));
    const status = await probeKey(account, get().settings);
    set((s) => ({ keyStatus: { ...s.keyStatus, [account]: status } }));
    return status;
  },

  async resetAll() {
    if (window.mockpulse) {
      await window.mockpulse.settings.reset();
    } else {
      localStorage.removeItem('mp_settings');
      localStorage.removeItem('mp_secret_gemini');
      localStorage.removeItem('mp_secret_groq');
    }
    set({
      settings: DEFAULT_SETTINGS,
      keyStatus: { gemini: 'missing', groq: 'missing' },
    });
  },
}));
