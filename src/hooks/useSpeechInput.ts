import { useCallback, useEffect, useRef, useState } from 'react';
import { stt, webspeechSupported } from '@/services/speech';
import { useSettingsStore } from '@/store/settingsStore';

export interface SpeechInputOptions {
  /** Master enable — pass `micOn && !interviewerSpeaking` for half-duplex. */
  active: boolean;
  onFinal: (text: string) => void;
  onPartial?: (text: string) => void;
}

const MAX_RESTARTS = 30;
const MAX_FAILURES = 4;

/**
 * Push-to-talk / continuous dictation with automatic restart.
 *  - Primary: Web Speech API (free, built into Chromium).
 *  - Fallback: MediaRecorder → Groq `whisper-large-v3` in 6s chunks.
 * Also exposes a live mic level for the meeting UI.
 */
export function useSpeechInput({ active, onFinal, onPartial }: SpeechInputOptions) {
  const engine = useSettingsStore((s) => s.settings.sttEngine);
  const [listening, setListening] = useState(false);
  const [partial, setPartial] = useState('');
  const [level, setLevel] = useState(0);
  const [error, setError] = useState('');
  const [blocked, setBlocked] = useState(false);

  const stopWebRef = useRef<(() => void) | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const rafRef = useRef(0);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const restartTimer = useRef(0);
  const busyRef = useRef(false);

  const activeRef = useRef(active);
  const restartsRef = useRef(0);
  const failuresRef = useRef(0);
  const startingRef = useRef(false);
  const blockedRef = useRef(false);
  const startRef = useRef<() => void>(() => undefined);

  activeRef.current = active;

  const stopMeter = useCallback(() => {
    cancelAnimationFrame(rafRef.current);
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    void audioCtxRef.current?.close().catch(() => undefined);
    audioCtxRef.current = null;
    setLevel(0);
  }, []);

  const startMeter = useCallback((stream: MediaStream) => {
    try {
      const Ctx =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      const ctx = new Ctx();
      audioCtxRef.current = ctx;
      const src = ctx.createMediaStreamSource(stream);
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 512;
      src.connect(analyser);
      const data = new Uint8Array(analyser.frequencyBinCount);
      const tick = () => {
        analyser.getByteTimeDomainData(data);
        let peak = 0;
        for (let i = 0; i < data.length; i++) peak = Math.max(peak, Math.abs(data[i] - 128) / 128);
        setLevel(Math.min(1, peak * 2.2));
        rafRef.current = requestAnimationFrame(tick);
      };
      tick();
    } catch {
      /* meter is cosmetic */
    }
  }, []);

  const stop = useCallback(() => {
    window.clearTimeout(restartTimer.current);
    stopWebRef.current?.();
    stopWebRef.current = null;
    try {
      if (recorderRef.current && recorderRef.current.state !== 'inactive') recorderRef.current.stop();
    } catch {
      /* ignore */
    }
    recorderRef.current = null;
    stopMeter();
    setListening(false);
    setPartial('');
  }, [stopMeter]);

  const fail = useCallback(
    (message: string) => {
      failuresRef.current += 1;
      setError(message);
      if (failuresRef.current >= MAX_FAILURES) {
        blockedRef.current = true;
        setBlocked(true);
        stop();
      }
    },
    [stop],
  );

  const whisperOnce = useCallback(
    async (stream: MediaStream) => {
      if (busyRef.current) return;
      busyRef.current = true;
      try {
        const result = await stt.transcribeWithWhisper(stream, { language: navigator.language });
        if (result.text) {
          failuresRef.current = 0;
          onFinal(result.text);
          setPartial('');
        }
      } catch (err) {
        fail(err instanceof Error ? err.message : String(err));
      } finally {
        busyRef.current = false;
      }
    },
    [fail, onFinal],
  );

  const start = useCallback(async () => {
    if (!activeRef.current || blockedRef.current || startingRef.current) return;
    startingRef.current = true;
    setError('');
    const preferWhisper = engine === 'groq-whisper' || !webspeechSupported();

    try {
      if (preferWhisper) {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        streamRef.current = stream;
        startMeter(stream);
        setListening(true);
        failuresRef.current = 0;

        if (typeof MediaRecorder !== 'undefined') {
          const mime = ['audio/webm;codecs=opus', 'audio/webm'].find((t) => MediaRecorder.isTypeSupported(t));
          const rec = new MediaRecorder(stream, mime ? { mimeType: mime } : undefined);
          recorderRef.current = rec;
          rec.ondataavailable = () => undefined;
          rec.start();
          // Chunked transcription every 6s keeps latency reasonable.
          const interval = window.setInterval(() => {
            if (rec.state !== 'inactive') rec.stop();
          }, 6000);
          rec.onstop = () => {
            void whisperOnce(stream);
            if (recorderRef.current === rec && streamRef.current && activeRef.current) {
              try {
                rec.start();
              } catch {
                window.clearInterval(interval);
                stop();
              }
            } else {
              window.clearInterval(interval);
            }
          };
        }
        return;
      }

      /* Web Speech path — the browser owns capture; we only open a meter. */
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        streamRef.current = stream;
        startMeter(stream);
      } catch {
        /* recognition can still work without our own meter */
      }

      setListening(true);
      stopWebRef.current = stt.listenWebSpeech({
        onPartial: (text) => {
          failuresRef.current = 0;
          restartsRef.current = 0;
          setPartial(text);
          onPartial?.(text);
        },
        onFinal: (text) => {
          failuresRef.current = 0;
          restartsRef.current = 0;
          setPartial('');
          onFinal(text);
        },
        onError: (err) => {
          if (err.message === 'not-allowed' || err.message === 'service-not-allowed') fail(err.message);
          else setError(err.message);
        },
        onEnd: () => {
          // Chromium ends continuous recognition after silence — auto-restart.
          if (!activeRef.current || blockedRef.current) {
            setListening(false);
            stopMeter();
            return;
          }
          if (restartsRef.current >= MAX_RESTARTS) {
            stop();
            return;
          }
          restartsRef.current += 1;
          window.clearTimeout(restartTimer.current);
          restartTimer.current = window.setTimeout(() => {
            if (activeRef.current && !blockedRef.current) {
              stopWebRef.current = null;
              void startRef.current();
            }
          }, 320);
        },
      });
    } catch (err) {
      fail((err as Error)?.message || 'Microphone permission denied.');
    } finally {
      startingRef.current = false;
    }
  }, [engine, fail, onFinal, onPartial, startMeter, stop, stopMeter, whisperOnce]);

  startRef.current = () => void start();

  /* Master enable / disable. */
  useEffect(() => {
    if (!active) {
      restartsRef.current = 0;
      failuresRef.current = 0;
      blockedRef.current = false;
      setBlocked(false);
      stop();
      return;
    }
    blockedRef.current = false;
    setBlocked(false);
    void start();
    return () => stop();
    // `start`/`stop` are memoised around stable inputs; re-running on them is safe.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active, engine]);

  useEffect(() => () => stop(), [stop]);

  return { listening, partial, level, error, blocked, start: () => void start(), stop };
}
