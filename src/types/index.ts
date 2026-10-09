export type TrackId =
  | 'frontend'
  | 'backend'
  | 'fullstack'
  | 'general';

export type SeniorityLevel = 'intern' | 'junior' | 'mid';

export type InterviewStage =
  | 'warmup'
  | 'technical'
  | 'coding'
  | 'system-design';

export type LLMProvider = 'gemini' | 'groq';

export type STTEngine = 'webspeech' | 'groq-whisper';
export type TTSEngine = 'webspeech' | 'edge-tts' | 'silent';

export type AvatarEmotion =
  | 'neutral'
  | 'thinking'
  | 'nod'
  | 'smile'
  | 'concern'
  | 'impressed';

export type Speaker = 'interviewer' | 'candidate' | 'system';

export type SessionStatus =
  | 'idle'
  | 'setup'
  | 'connecting'
  | 'live'
  | 'paused'
  | 'report'
  | 'ended';

/* ---------------------------------- Tracks --------------------------------- */

export interface Track {
  id: TrackId;
  title: string;
  summary: string;
  skills: string[];
  accent: string;
}

export interface Seniority {
  id: SeniorityLevel;
  title: string;
  years: string;
  expectations: string;
}

/* --------------------------------- Settings -------------------------------- */

export interface AppSettings {
  provider: LLMProvider;
  model: string;
  geminiModel: string;
  groqModel: string;
  sttEngine: STTEngine;
  ttsEngine: TTSEngine;
  ttsVoice: string;
  avatarUrl: string;
  avatarName: string;
  interviewerName: string;
  interviewerTitle: string;
  temperature: number;
  realtimeReactions: boolean;
  hdAvatar: boolean;
  darkMode: boolean;
}

export const DEFAULT_SETTINGS: AppSettings = {
  provider: 'gemini',
  model: 'gemini-3.8-flash',
  geminiModel: 'gemini-3.8-flash',
  groqModel: 'llama-3.3-70b-versatile',
  sttEngine: 'webspeech',
  ttsEngine: 'webspeech',
  ttsVoice: '',
  avatarUrl: '',
  avatarName: 'Alex Mercer',
  interviewerName: 'Alex Mercer',
  interviewerTitle: 'Senior Engineering Manager',
  temperature: 0.7,
  realtimeReactions: true,
  hdAvatar: true,
  darkMode: true,
};

/* ------------------------------ Interview config --------------------------- */

export interface InterviewConfig {
  track: TrackId;
  seniority: SeniorityLevel;
  focusSkills: string[];
  targetCompany: string;
  durationMinutes: number;
  stages: InterviewStage[];
}

/* ------------------------------ Conversation ------------------------------- */

export interface ChatMessage {
  id: string;
  speaker: Speaker;
  stage: InterviewStage;
  text: string;
  ts: number;
  emotion?: AvatarEmotion;
  meta?: {
    evaluation?: AnswerEvaluation;
    latencyMs?: number;
    tokens?: number;
  };
}

export interface CodingTask {
  id: string;
  stage: InterviewStage;
  title: string;
  prompt: string;
  language: string;
  starterCode: string;
  hints?: string[];
  constraints?: string[];
  expectedApproach?: string;
  solution?: string;
}

/* ------------------------------- Evaluation -------------------------------- */

export interface AnswerEvaluation {
  score: number;
  strengths: string[];
  weaknesses: string[];
  followUp?: string;
  perfect?: boolean;
}

export interface StageScore {
  stage: InterviewStage;
  score: number;
  weight: number;
  notes: string;
}

export interface InterviewReport {
  id: string;
  createdAt: number;
  config: InterviewConfig;
  candidateName: string;
  interviewerName: string;
  overallScore: number;
  grade: string;
  breakdown: {
    technicalAccuracy: number;
    communication: number;
    codeEfficiency: number;
    problemSolving: number;
    seniorityAlignment: number;
  };
  stageScores: StageScore[];
  strengths: string[];
  improvements: string[];
  idealAnswers: { question: string; ideal: string }[];
  questionCount: number;
  durationMinutes: number;
  summary: string;
  recommendation: 'strong-hire' | 'hire' | 'lean-hire' | 'no-hire';
}

/* --------------------------- Structured LLM output ------------------------- */

export interface InterviewTurn {
  interviewerMessage: string;
  emotion: AvatarEmotion;
  nextStage: InterviewStage | 'continue' | 'finish';
  evaluation: AnswerEvaluation;
  followUpQuestion?: string;
  emitCodingTask?: boolean;
}

export interface ReportDraft {
  breakdown: InterviewReport['breakdown'];
  stageScores: Omit<StageScore, 'weight'>[];
  strengths: string[];
  improvements: string[];
  idealAnswers: InterviewReport['idealAnswers'];
  summary: string;
  recommendation: InterviewReport['recommendation'];
}

/* ------------------------------ Electron bridge ---------------------------- */

export interface ElectronBridge {
  platform: string;
  settings: {
    get(): Promise<AppSettings | Record<string, unknown>>;
    set(patch: Record<string, unknown>): Promise<unknown>;
    reset(): Promise<unknown>;
  };
  keytar: {
    service: string;
    getPassword(account: string): Promise<string | null>;
    setPassword(account: string, value: string): Promise<boolean>;
    deletePassword(account: string): Promise<boolean>;
    findCredentials(): Promise<{ account: string; password: string }[]>;
    backend(): Promise<'os-keystore' | 'aes-256-fallback'>;
  };
  reports: {
    list(): Promise<{ file: string; mtime: number; size: number }[]>;
    save(report: InterviewReport): Promise<string>;
    load(file: string): Promise<InterviewReport | null>;
    export(payload: { name: string; content: string }): Promise<string | null>;
  };
  app: {
    info(): Promise<{
      version: string;
      platform: string;
      arch: string;
      electron: string;
      chrome: string;
      node: string;
      dev: boolean;
    }>;
    openPath(p: string): Promise<string>;
  };
  files: {
    getPathForFile(file: File): string | null;
  };
}

declare global {
  interface Window {
    mockpulse?: ElectronBridge;
  }
}

export {};
