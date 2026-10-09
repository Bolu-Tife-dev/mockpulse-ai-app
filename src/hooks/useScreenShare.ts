import { useCallback, useEffect, useRef, useState } from 'react';

export interface ScreenShareState {
  active: boolean;
  pending: boolean;
  error: string;
  videoRef: React.RefObject<HTMLVideoElement>;
  start(): Promise<void>;
  stop(): void;
}

export function useScreenShare(): ScreenShareState {
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [active, setActive] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState('');

  const stop = useCallback(() => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    if (videoRef.current) videoRef.current.srcObject = null;
    setActive(false);
  }, []);

  const start = useCallback(async () => {
    if (!navigator.mediaDevices?.getDisplayMedia) {
      setError('Screen capture is unavailable in this environment.');
      return;
    }
    setPending(true);
    setError('');
    try {
      const stream = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: false });
      stop();
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play().catch(() => undefined);
      }
      stream.getVideoTracks()[0]?.addEventListener('ended', stop);
      setActive(true);
    } catch (err) {
      if ((err as DOMException)?.name !== 'NotAllowedError') {
        setError((err as Error)?.message || 'Screen share failed.');
      }
    } finally {
      setPending(false);
    }
  }, [stop]);

  useEffect(() => () => stop(), [stop]);

  return { active, pending, error, videoRef, start, stop };
}
