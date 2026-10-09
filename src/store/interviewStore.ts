import { create } from 'zustand';
import { InterviewerService } from '@/services/ai/interviewer';
import { tts } from '@/services/speech';
import { useSettingsStore } from './settingsStore';
import type {
  AnswerEvaluation,
  AvatarEmotion,
  ChatMessage,
  CodingTask,
  InterviewConfig,
  InterviewReport,
  InterviewStage,
  SessionStatus,
} from '@/types';

export const STAGES: InterviewStage[] = ['warmup', 'technical', 'coding', 'system-design'];

let service: InterviewerService | null = null;
let sessionId = `s_${Date.now().toString(36)}`;
let startedAt = 0;

const uid = () => Math.random().toString(36).slice(2, 10);

interface InterviewState {
  status: SessionStatus;
  candidateName: string;
  config: InterviewConfig;
  stage: InterviewStage;
  messages: ChatMessage[];
  task: CodingTask | null;
  code: string;
  language: string;
  report: InterviewReport | null;
  busy: boolean;
  thinking: boolean;
  speaking: boolean;
  error: string | null;
  micOn: boolean;
  camOn: boolean;
  audioMuted: boolean;
  screenShare: boolean;
  captions: string;
  activeEmotion: AvatarEmotion;
  hintIndex: number;
  showSolution: boolean;
  durationMinutes: number;

  setStatus(s: SessionStatus): void;
  setCandidacy(name: string): void;
  setConfig(config: Partial<InterviewConfig>): void;
  start(): Promise<void>;
  submitAnswer(text: string): Promise<void>;
  requestHint(): void;
  revealSolution(): void;
  endInterview(): Promise<void>;
  buildReport(): Promise<void>;
  setCode(code: string): void;
  setLanguage(lang: string): void;
  toggleMic(): void;
  toggleCam(): void;
  toggleAudio(): void;
  toggleScreen(): void;
  setCaptions(t: string): void;
  clearError(): void;
  reset(): void;

  persistInterviewerTurn(
    text: string,
    emotion: AvatarEmotion,
    stage: InterviewStage,
    evaluation?: AnswerEvaluation,
  ): void;
  loadCodingTask(): Promise<void>;
}

const DEFAULT_CONFIG: InterviewConfig = {
  track: 'frontend',
  seniority: 'junior',
  focusSkills: [],
  targetCompany: '',
  durationMinutes: 45,
  stages: [...STAGES],
};

function pushMessage(state: InterviewState, msg: Omit<ChatMessage, 'id' | 'ts'>): ChatMessage[] {
  const full: ChatMessage = { id: uid(), ts: Date.now(), ...msg };
  return [...state.messages, full];
}

export const useInterviewStore = create<InterviewState>((set, get) => ({
  status: 'idle',
  candidateName: 'Candidate',
  config: DEFAULT_CONFIG,
  stage: 'warmup',
  messages: [],
  task: null,
  code: '',
  language: 'javascript',
  report: null,
  busy: false,
  thinking: false,
  speaking: false,
  error: null,
  micOn: true,
  camOn: true,
  audioMuted: false,
  screenShare: false,
  captions: '',
  activeEmotion: 'neutral',
  hintIndex: 0,
  showSolution: false,
  durationMinutes: 0,

  setStatus(s) {
    set({ status: s });
  },

  setCandidacy(name) {
    set({ candidateName: name.trim() || 'Candidate' });
  },

  setConfig(patch) {
    set((s) => ({ config: { ...s.config, ...patch } }));
  },

  async start() {
    const state = get();
    const settings = useSettingsStore.getState().settings;
    sessionId = `s_${Date.now().toString(36)}`;
    startedAt = Date.now();
    service = new InterviewerService(settings, state.config, state.candidateName);

    set({
      status: 'connecting',
      messages: [],
      task: null,
      code: '',
      report: null,
      stage: 'warmup',
      error: null,
      busy: true,
      thinking: true,
      hintIndex: 0,
      showSolution: false,
      audioMuted: false,
    });

    tts.configure(settings.ttsEngine);

    try {
      const turn = await service.open([]);
      set({ status: 'live', busy: false, thinking: false, activeEmotion: turn.emotion });
      get().persistInterviewerTurn(turn.interviewerMessage, turn.emotion, 'warmup', turn.evaluation);
      speakTurn(turn.interviewerMessage, turn.emotion, (speaking) => set({ speaking }));
    } catch (err) {
      set({
        status: 'setup',
        busy: false,
        thinking: false,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  },

  async submitAnswer(text) {
    const answer = text.trim();
    if (!answer || get().busy) return;

    set((s) => ({
      busy: true,
      thinking: true,
      captions: '',
      messages: pushMessage(s, {
        speaker: 'candidate',
        stage: s.stage,
        text: answer,
      }),
    }));

    const history = get().messages;

    try {
      const turn = await service!.respond(history);
      const nextStage = normalizeStage(turn.nextStage, get().stage, get().config.stages);

      set({
        busy: false,
        thinking: false,
        stage: nextStage,
        activeEmotion: turn.emotion,
      });

      get().persistInterviewerTurn(turn.interviewerMessage, turn.emotion, nextStage, turn.evaluation);

      speakTurn(turn.interviewerMessage, turn.emotion, (speaking) => set({ speaking }));

      const needsTask = turn.emitCodingTask || (nextStage === 'coding' && !get().task);
      if (needsTask) void get().loadCodingTask();
    } catch (err) {
      set({
        busy: false,
        thinking: false,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  },

  requestHint() {
    const hints = get().task?.hints || [];
    const idx = get().hintIndex;
    if (idx >= hints.length) return;
    set((s) => ({
      hintIndex: idx + 1,
      messages: pushMessage(s, {
        speaker: 'system',
        stage: 'coding',
        text: `Hint ${idx + 1}: ${hints[idx]}`,
        emotion: 'thinking',
      }),
    }));
  },

  revealSolution() {
    const task = get().task;
    if (!task?.solution) return;
    set((s) => ({
      showSolution: true,
      messages: pushMessage(s, {
        speaker: 'system',
        stage: 'coding',
        text: `Reference solution:\n\n${task.solution}${task.expectedApproach ? `\n\nApproach: ${task.expectedApproach}` : ''}`,
      }),
    }));
  },

  async endInterview() {
    if (get().status === 'ended') return;
    tts.stop();
    const minutes = startedAt ? Math.max(1, Math.round((Date.now() - startedAt) / 60000)) : 0;
    set({ status: 'ended', speaking: false, busy: true, durationMinutes: minutes, captions: '' });
    await get().buildReport();
  },

  async buildReport() {
    const state = get();
    if (!service || state.messages.length === 0) {
      set({ status: 'report', busy: false });
      return;
    }
    set({ busy: true, thinking: true, error: null });
    try {
      const report = await service.generateReport(state.messages, {
        id: sessionId,
        durationMinutes: state.durationMinutes || 1,
      });
      set({ report, status: 'report', busy: false, thinking: false });
      if (window.mockpulse) {
        void window.mockpulse.reports.save(report).catch(() => undefined);
      }
    } catch (err) {
      set({
        status: 'report',
        busy: false,
        thinking: false,
        report: null,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  },

  setCode(code) {
    set({ code });
  },

  setLanguage(language) {
    set({ language });
  },

  toggleMic() {
    const on = !get().micOn;
    set({ micOn: on });
    if (!on) {
      tts.stop();
      set({ speaking: false, captions: '' });
    }
  },

  toggleCam() {
    set({ camOn: !get().camOn });
  },

  toggleAudio() {
    const muted = !get().audioMuted;
    set({ audioMuted: muted });
    if (muted) {
      tts.stop();
      set({ speaking: false, captions: '' });
    }
  },

  toggleScreen() {
    set({ screenShare: !get().screenShare });
  },

  setCaptions(captions) {
    set({ captions });
  },

  clearError() {
    set({ error: null });
  },

  reset() {
    tts.stop();
    service = null;
    startedAt = 0;
    set({
      status: 'idle',
      messages: [],
      task: null,
      code: '',
      language: 'javascript',
      report: null,
      busy: false,
      thinking: false,
      speaking: false,
      error: null,
      stage: 'warmup',
      activeEmotion: 'neutral',
      captions: '',
      hintIndex: 0,
      showSolution: false,
      durationMinutes: 0,
      screenShare: false,
    });
  },

  /* --------------------------- internal helpers --------------------------- */

  persistInterviewerTurn(text, emotion, stage, evaluation) {
    set((s) => ({
      messages: pushMessage(s, {
        speaker: 'interviewer',
        stage,
        text,
        emotion,
        meta: evaluation ? { evaluation } : undefined,
      }),
    }));
  },

  async loadCodingTask() {
    if (!service || get().task) return;
    set({ busy: true, thinking: true });
    try {
      const task = await service.generateCodingTask();
      set({
        task,
        language: task.language,
        code: task.starterCode,
        busy: false,
        thinking: false,
        messages: pushMessage(get(), {
          speaker: 'interviewer',
          stage: 'coding',
          text: `Let's move to a live coding exercise — "${task.title}". I've opened it in the editor on your right. Take your time and think out loud.`,
          emotion: 'neutral',
        }),
      });
      speakTurn(
        `Let's move to a live coding exercise. I've opened it in the editor on your right. Take your time and think out loud.`,
        'neutral',
        (speaking) => set({ speaking }),
      );
    } catch (err) {
      set({
        busy: false,
        thinking: false,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  },
}));

/* ------------------------------- helpers ---------------------------------- */

function normalizeStage(
  next: InterviewStage | 'continue' | 'finish',
  current: InterviewStage,
  allowed: InterviewStage[],
): InterviewStage {
  if (next === 'continue' || next === 'finish') return current;
  if (allowed.length && !allowed.includes(next)) return current;
  return next;
}

function speakTurn(text: string, emotion: AvatarEmotion, onChange: (speaking: boolean) => void) {
  const { settings } = useSettingsStore.getState();
  const { audioMuted } = useInterviewStore.getState();
  if (settings.ttsEngine === 'silent' || audioMuted) {
    onChange(false);
    return;
  }
  onChange(true);
  tts.speak(text, {
    voiceURI: settings.ttsVoice || undefined,
    rate: 1.02,
    pitch: 1,
    onStart: () => {
      useInterviewStore.setState({ speaking: true, activeEmotion: emotion });
    },
    onEnd: () => {
      onChange(false);
      useInterviewStore.setState({ speaking: false, activeEmotion: 'neutral' });
    },
    onError: () => onChange(false),
  });
}

export function getActiveService(): InterviewerService | null {
  return service;
}
