import { createClient, parseStructured, type ChatRole, type LLMClient } from './client';
import {
  buildCodingTaskPrompt,
  buildReportPrompt,
  buildSystemPrompt,
} from './prompts';
import type {
  AnswerEvaluation,
  AppSettings,
  ChatMessage,
  CodingTask,
  InterviewConfig,
  InterviewReport,
  InterviewTurn,
  ReportDraft,
} from '@/types';

const STAGE_ORDER = ['warmup', 'technical', 'coding', 'system-design'] as const;

function clamp(n: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, n));
}

export class InterviewerService {
  private client: LLMClient;
  private abort: AbortSignal | undefined;

  constructor(
    private settings: AppSettings,
    private config: InterviewConfig,
    private candidateName: string,
  ) {
    this.client = createClient(settings);
  }

  updateSettings(settings: AppSettings) {
    this.settings = settings;
    this.client = createClient(settings);
  }

  setSignal(signal?: AbortSignal) {
    this.abort = signal;
  }

  cancel() {
    /* best-effort; callers also abort their own controllers */
  }

  private systemPrompt(): string {
    return buildSystemPrompt(this.settings, this.config, this.candidateName);
  }

  private toRoles(history: ChatMessage[]): ChatRole[] {
    return history.map((m) => ({
      role: m.speaker === 'interviewer' ? 'assistant' : 'user',
      content: m.text,
    }));
  }

  /** Opens the interview with the first warm-up question. */
  async open(history: ChatMessage[]): Promise<InterviewTurn> {
    return this.turn(
      history,
      'Begin the interview now. Greet the candidate briefly, confirm the role, and ask your first warm-up question.',
    );
  }

  async respond(history: ChatMessage[]): Promise<InterviewTurn> {
    return this.turn(history, null);
  }

  private async turn(history: ChatMessage[], opening?: string | null): Promise<InterviewTurn> {
    const roles: ChatRole[] = [
      { role: 'system', content: this.systemPrompt() },
      ...this.toRoles(history),
      ...(opening ? [{ role: 'user' as const, content: opening }] : []),
    ];

    const { text } = await this.client.complete(roles, { json: true, signal: this.abort });

    let parsed: Partial<InterviewTurn>;
    try {
      parsed = parseStructured<InterviewTurn>(text);
    } catch {
      parsed = {
        interviewerMessage: text.trim().replace(/^```(?:json)?|```$/g, '').slice(0, 600),
        emotion: 'neutral',
        nextStage: 'continue',
        evaluation: { score: 0.5, strengths: [], weaknesses: [], perfect: false },
      };
    }

    const evaluation = normalizeEvaluation(parsed.evaluation);
    const stage = inferStage(parsed.nextStage ?? 'continue', history);

    return {
      interviewerMessage: (parsed.interviewerMessage || '').trim() || 'Could you walk me through your thinking there?',
      emotion: parsed.emotion || 'neutral',
      nextStage: stage,
      evaluation,
      followUpQuestion: parsed.followUpQuestion,
      emitCodingTask: parsed.emitCodingTask === true,
    };
  }

  /** Generates the Monaco coding challenge for the coding stage. */
  async generateCodingTask(): Promise<CodingTask> {
    const roles: ChatRole[] = [
      { role: 'system', content: this.systemPrompt() },
      { role: 'user', content: buildCodingTaskPrompt(this.config, this.config.seniority) },
    ];

    const { text } = await this.client.complete(roles, { json: true, signal: this.abort });
    const raw = parseStructured<Partial<CodingTask>>(text);

    const language = (raw.language || 'javascript').toLowerCase();

    return {
      id: `task_${Date.now().toString(36)}`,
      stage: 'coding',
      title: raw.title || 'Live Coding Challenge',
      prompt: raw.prompt || 'Implement the requested behaviour.',
      language,
      starterCode: raw.starterCode || defaultStarter(language),
      constraints: raw.constraints || [],
      hints: raw.hints || [],
      expectedApproach: raw.expectedApproach || '',
      solution: raw.solution || '',
    };
  }

  /** Full post-interview scorecard with a second structured pass. */
  async generateReport(
    history: ChatMessage[],
    meta: { id: string; durationMinutes: number },
  ): Promise<InterviewReport> {
    const transcript = history
      .map((m) => `[${m.speaker.toUpperCase()} · ${m.stage}] ${m.text}`)
      .join('\n')
      .slice(0, 60000);

    const roles: ChatRole[] = [
      { role: 'system', content: 'You are a precise, non-lenient interview debrief analyst. JSON only.' },
      { role: 'user', content: buildReportPrompt(this.config, this.config.seniority, transcript) },
    ];

    const { text } = await this.client.complete(roles, { json: true, signal: this.abort });
    const draft = parseStructured<ReportDraft>(text);

    const b = draft.breakdown || {
      technicalAccuracy: 0,
      communication: 0,
      codeEfficiency: 0,
      problemSolving: 0,
      seniorityAlignment: 0,
    };

    const stageScores = (draft.stageScores || []).map((s) => ({
      stage: s.stage,
      score: clamp(Math.round(s.score), 0, 100),
      weight: STAGE_ORDER.includes(s.stage as (typeof STAGE_ORDER)[number]) ? 25 : 0,
      notes: s.notes || '',
    }));

    const overall = Math.round(
      (clamp(b.technicalAccuracy, 0, 100) * 0.3 +
        clamp(b.communication, 0, 100) * 0.15 +
        clamp(b.codeEfficiency, 0, 100) * 0.2 +
        clamp(b.problemSolving, 0, 100) * 0.2 +
        clamp(b.seniorityAlignment, 0, 100) * 0.15),
    );

    return {
      id: meta.id,
      createdAt: Date.now(),
      config: this.config,
      candidateName: this.candidateName,
      interviewerName: this.settings.interviewerName,
      overallScore: overall,
      grade: gradeFor(overall),
      breakdown: {
        technicalAccuracy: clamp(Math.round(b.technicalAccuracy), 0, 100),
        communication: clamp(Math.round(b.communication), 0, 100),
        codeEfficiency: clamp(Math.round(b.codeEfficiency), 0, 100),
        problemSolving: clamp(Math.round(b.problemSolving), 0, 100),
        seniorityAlignment: clamp(Math.round(b.seniorityAlignment), 0, 100),
      },
      stageScores,
      strengths: (draft.strengths || []).slice(0, 6),
      improvements: (draft.improvements || []).slice(0, 6),
      idealAnswers: (draft.idealAnswers || []).slice(0, 4),
      questionCount: history.filter((m) => m.speaker === 'interviewer').length,
      durationMinutes: meta.durationMinutes,
      summary: draft.summary || '',
      recommendation: draft.recommendation || 'lean-hire',
    };
  }
}

/* --------------------------------- helpers -------------------------------- */

function normalizeEvaluation(raw: unknown): AnswerEvaluation {
  const e = (raw || {}) as Partial<AnswerEvaluation>;
  const score = typeof e.score === 'number' ? e.score : 0.5;
  return {
    score: clamp(score <= 1 ? score : score / 100, 0, 1),
    strengths: Array.isArray(e.strengths) ? e.strengths.slice(0, 3).map(String) : [],
    weaknesses: Array.isArray(e.weaknesses) ? e.weaknesses.slice(0, 3).map(String) : [],
    followUp: e.followUp ? String(e.followUp) : undefined,
    perfect: !!e.perfect,
  };
}

function inferStage(
  nextStage: InterviewTurn['nextStage'],
  history: ChatMessage[],
): InterviewTurn['nextStage'] {
  if (!nextStage || nextStage === 'continue') {
    const last = [...history].reverse().find((m) => m.speaker === 'interviewer');
    return last?.stage || 'warmup';
  }
  return nextStage;
}

export function gradeFor(score: number): string {
  if (score >= 90) return 'Exceptional';
  if (score >= 80) return 'Strong';
  if (score >= 70) return 'Solid';
  if (score >= 60) return 'Developing';
  return 'Needs Work';
}

function defaultStarter(language: string): string {
  switch (language) {
    case 'python':
      return 'def solve(data):\n    """TODO: implement"""\n    pass\n';
    case 'java':
      return 'class Solution {\n    public int solve(int[] input) {\n        // TODO\n        return -1;\n    }\n}\n';
    case 'sql':
      return '-- TODO: write your query\nSELECT *\nFROM orders\nWHERE 1 = 1;\n';
    case 'go':
      return 'package main\n\nfunc solve(input []int) int {\n\t// TODO\n\treturn -1\n}\n';
    case 'typescript':
      return 'function solve(input: unknown): unknown {\n  // TODO\n  return input;\n}\n';
    default:
      return 'function solve(input) {\n  // TODO\n  return input;\n}\n';
  }
}
