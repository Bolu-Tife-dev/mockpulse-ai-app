import { useCallback, useEffect, useRef, useState } from 'react';

export type CameraState = 'idle' | 'requesting' | 'live' | 'denied' | 'unsupported';

export function useCamera(active: boolean) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [state, setState] = useState<CameraState>('idle');
  const [devices, setDevices] = useState<MediaDeviceInfo[]>([]);
  const [deviceId, setDeviceId] = useState<string>('');
  const [error, setError] = useState<string>('');

  const stop = useCallback(() => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    if (videoRef.current) videoRef.current.srcObject = null;
  }, []);

  const start = useCallback(
    async (forcedDevice?: string) => {
      if (!navigator.mediaDevices?.getUserMedia) {
        setState('unsupported');
        setError('Camera API unavailable in this environment.');
        return;
      }
      setState('requesting');
      setError('');
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: forcedDevice
            ? { deviceId: { exact: forcedDevice }, width: { ideal: 1280 }, height: { ideal: 720 } }
            : { width: { ideal: 1280 }, height: { ideal: 720 }, facingMode: 'user' },
          audio: false,
        });
        stop();
        streamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          await videoRef.current.play().catch(() => undefined);
        }
        setState('live');
        try {
          const list = await navigator.mediaDevices.enumerateDevices();
          setDevices(list.filter((d) => d.kind === 'videoinput'));
        } catch {
          /* ignore */
        }
      } catch (err) {
        const name = (err as DOMException)?.name || '';
        setState(name === 'NotAllowedError' || name === 'SecurityError' ? 'denied' : 'unsupported');
        setError((err as Error)?.message || 'Could not open the camera.');
      }
    },
    [stop],
  );

  useEffect(() => {
    if (active) void start(deviceId || undefined);
    else stop();
    return () => {
      if (!active) stop();
    };
  }, [active, deviceId, start, stop]);

  useEffect(() => () => stop(), [stop]);

  return { videoRef, state, devices, deviceId, setDeviceId, error, restart: start, stop };
}
