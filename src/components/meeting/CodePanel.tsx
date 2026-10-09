import { useCallback, useEffect, useRef, useState } from 'react';
import Editor from '@monaco-editor/react';
import { useInterviewStore } from '@/store/interviewStore';

const LANGUAGES = [
  { id: 'javascript', label: 'JavaScript' },
  { id: 'typescript', label: 'TypeScript' },
  { id: 'python', label: 'Python' },
  { id: 'java', label: 'Java' },
  { id: 'sql', label: 'SQL' },
  { id: 'go', label: 'Go' },
];

const RUNNER = `
self.onmessage = async (e) => {
  const out = [];
  const fmt = (v) => {
    if (typeof v === 'string') return v;
    try { return JSON.stringify(v); } catch (_) { return String(v); }
  };
  const mk = (level) => (...a) => out.push(a.map(fmt).join(' '));
  const sandboxConsole = { log: mk('log'), info: mk('info'), warn: mk('warn'), error: mk('error'), debug: mk('log') };
  try {
    const fn = new Function('console', '"use strict";\\n' + e.data.code + '\\n//# sourceURL=mockpulse-user.js');
    fn(sandboxConsole);
    self.postMessage({ ok: true, out: out.join('\\n') || '(no output — call console.log to see results)' });
  } catch (err) {
    self.postMessage({ ok: false, out: out.join('\\n') + (out.length ? '\\n' : '') + String((err && err.stack) || err) });
  }
};
`;

interface RunResult {
  ok: boolean;
  out: string;
}

export default function CodePanel() {
  const task = useInterviewStore((s) => s.task);
  const code = useInterviewStore((s) => s.code);
  const language = useInterviewStore((s) => s.language);
  const stage = useInterviewStore((s) => s.stage);
  const busy = useInterviewStore((s) => s.busy);
  const hintIndex = useInterviewStore((s) => s.hintIndex);
  const showSolution = useInterviewStore((s) => s.showSolution);

  const setCode = useInterviewStore((s) => s.setCode);
  const setLanguage = useInterviewStore((s) => s.setLanguage);
  const loadCodingTask = useInterviewStore((s) => s.loadCodingTask);
  const requestHint = useInterviewStore((s) => s.requestHint);
  const revealSolution = useInterviewStore((s) => s.revealSolution);

  const [result, setResult] = useState<RunResult | null>(null);
  const [running, setRunning] = useState(false);
  const [showPrompt, setShowPrompt] = useState(true);
  const workerRef = useRef<Worker | null>(null);
  const timerRef = useRef(0);

  useEffect(
    () => () => {
      window.clearTimeout(timerRef.current);
      workerRef.current?.terminate();
    },
    [],
  );

  const run = useCallback(() => {
    if (language !== 'javascript') {
      setResult({
        ok: false,
        out: `In-browser execution is only available for JavaScript.\nWalk through your ${LANGUAGES.find((l) => l.id === language)?.label ?? language} solution out loud with the interviewer — that is what a real interview looks like.`,
      });
      return;
    }
    workerRef.current?.terminate();
    setRunning(true);
    setResult(null);

    try {
      const blob = new Blob([RUNNER], { type: 'application/javascript' });
      const url = URL.createObjectURL(blob);
      const worker = new Worker(url);
      workerRef.current = worker;

      worker.onmessage = (e: MessageEvent<RunResult>) => {
        setResult(e.data);
        setRunning(false);
        worker.terminate();
        URL.revokeObjectURL(url);
      };
      worker.onerror = (e) => {
        setResult({ ok: false, out: String(e.message || 'Execution failed.') });
        setRunning(false);
        worker.terminate();
        URL.revokeObjectURL(url);
      };
      worker.postMessage({ code });

      timerRef.current = window.setTimeout(() => {
        if (workerRef.current === worker) {
          worker.terminate();
          setResult({ ok: false, out: 'Execution timed out after 2s (possible infinite loop).' });
          setRunning(false);
        }
      }, 2000);
    } catch (err) {
      setResult({ ok: false, out: String(err) });
      setRunning(false);
    }
  }, [code, language]);

  const hints = task?.hints ?? [];
  const canHint = !!task && hintIndex < hints.length;

  return (
    <div className="flex h-full min-h-0 flex-col">
      {/* task card */}
      <div className="shrink-0 border-b border-white/8">
        <button
          type="button"
          onClick={() => setShowPrompt((v) => !v)}
          className="flex w-full items-center justify-between gap-3 px-4 py-2.5 text-left hover:bg-white/[0.03]"
        >
          <span className="flex min-w-0 items-center gap-2">
            <span className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-400">Challenge</span>
            <span className="truncate text-[12.5px] font-semibold text-white">{task?.title ?? '—'}</span>
          </span>
          <span className="text-[10px] text-slate-500">{showPrompt ? 'hide ▲' : 'show ▼'}</span>
        </button>

        {showPrompt && (
          <div className="scrollbar-thin max-h-44 overflow-y-auto px-4 pb-3">
            {task ? (
              <>
                <p className="whitespace-pre-wrap text-[12.5px] leading-relaxed text-slate-300">{task.prompt}</p>
                {!!task.constraints?.length && (
                  <ul className="mt-2 space-y-1">
                    {task.constraints.map((c) => (
                      <li key={c} className="flex gap-2 text-[11.5px] text-slate-500">
                        <span className="text-night-400">▸</span>
                        {c}
                      </li>
                    ))}
                  </ul>
                )}
              </>
            ) : (
              <div className="flex flex-col items-start gap-2 py-1">
                <p className="text-[12.5px] leading-relaxed text-slate-400">
                  {stage === 'coding'
                    ? 'Your interviewer is preparing a challenge for you.'
                    : 'A live coding challenge appears here when the interview reaches the coding stage.'}
                </p>
                <button
                  type="button"
                  className="btn-ghost !py-1.5 !text-[12px]"
                  disabled={busy}
                  onClick={() => void loadCodingTask()}
                >
                  {busy ? 'Generating…' : 'Load a challenge now'}
                </button>
              </div>
            )}
          </div>
        )}
      </div>

      {/* toolbar */}
      <div className="flex shrink-0 flex-wrap items-center gap-2 border-b border-white/8 bg-black/20 px-3 py-2">
        <select
          className="rounded-lg border border-white/10 bg-black/40 px-2 py-1.5 text-[11.5px] font-medium text-slate-200 outline-none"
          value={language}
          onChange={(e) => setLanguage(e.target.value)}
          aria-label="Language"
        >
          {LANGUAGES.map((l) => (
            <option key={l.id} value={l.id} className="bg-night-950">
              {l.label}
            </option>
          ))}
        </select>

        <button type="button" className="btn-primary !rounded-lg !px-3 !py-1.5 !text-[12px]" onClick={run} disabled={running}>
          {running ? 'Running…' : '▶ Run'}
        </button>

        <button
          type="button"
          className="btn-ghost !rounded-lg !px-3 !py-1.5 !text-[12px]"
          onClick={requestHint}
          disabled={!canHint}
          title={canHint ? `Hint ${hintIndex + 1} of ${hints.length}` : 'No more hints'}
        >
          Hint {hints.length ? `${Math.min(hintIndex + 1, hints.length)}/${hints.length}` : ''}
        </button>

        <button
          type="button"
          className="btn-ghost !rounded-lg !px-3 !py-1.5 !text-[12px]"
          onClick={revealSolution}
          disabled={!task?.solution || showSolution}
        >
          {showSolution ? 'Solution shown' : 'Solution'}
        </button>

        <button
          type="button"
          className="btn-ghost ml-auto !rounded-lg !px-3 !py-1.5 !text-[12px]"
          onClick={() => task && setCode(task.starterCode)}
          disabled={!task}
        >
          Reset
        </button>
      </div>

      {/* editor */}
      <div className="min-h-0 flex-1">
        <Editor
          height="100%"
          language={language}
          value={code}
          onChange={(v) => setCode(v ?? '')}
          theme="vs-dark"
          loading={
            <div className="flex h-full items-center justify-center text-xs text-slate-500">Loading editor…</div>
          }
          options={{
            fontSize: 13,
            fontFamily: 'JetBrains Mono, Fira Code, monospace',
            fontLigatures: true,
            minimap: { enabled: true, scale: 1 },
            scrollBeyondLastLine: false,
            automaticLayout: true,
            padding: { top: 14, bottom: 14 },
            renderLineHighlight: 'all',
            smoothScrolling: true,
            cursorBlinking: 'smooth',
            tabSize: 2,
            wordWrap: 'on',
            bracketPairColorization: { enabled: true },
          }}
        />
      </div>

      {/* console */}
      {(result || showSolution) && (
        <div className="shrink-0 border-t border-white/8 bg-black/40">
          {result && (
            <div className="max-h-32 overflow-y-auto px-4 py-2.5">
              <div className="mb-1 text-[10px] font-semibold uppercase tracking-widest text-slate-500">
                {result.ok ? 'Output' : 'Error'}
              </div>
              <pre
                className={`whitespace-pre-wrap font-mono text-[11.5px] leading-relaxed ${
                  result.ok ? 'text-pulse-400' : 'text-rose-300'
                }`}
              >
                {result.out}
              </pre>
            </div>
          )}
          {showSolution && task && (
            <div className="max-h-40 overflow-y-auto border-t border-white/8 px-4 py-2.5">
              <div className="mb-1 text-[10px] font-semibold uppercase tracking-widest text-night-300">
                Reference solution
              </div>
              {task.expectedApproach && (
                <p className="mb-1.5 text-[11.5px] leading-relaxed text-slate-400">{task.expectedApproach}</p>
              )}
              <pre className="whitespace-pre-wrap font-mono text-[11.5px] leading-relaxed text-slate-300">
                {task.solution}
              </pre>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
