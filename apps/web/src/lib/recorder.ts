import { useCallback, useEffect, useRef, useState } from "react";

/**
 * MediaRecorder with a level meter, shared by the speak exercise and the
 * studio. Mono, no processing (the pipeline normalises), Opus in WebM
 * where the browser has it. `unsupported` is true when there is no
 * microphone API at all; `denied` when the learner said no.
 */
export interface Take {
  readonly blob: Blob;
  readonly url: string;
  readonly mime: string;
  readonly durationMs: number;
}

export function useRecorder() {
  const [state, setState] = useState<"idle" | "recording" | "done">("idle");
  const [level, setLevel] = useState(0);
  const [take, setTake] = useState<Take | null>(null);
  const [denied, setDenied] = useState(false);
  const rec = useRef<MediaRecorder | null>(null);
  const raf = useRef<number | null>(null);
  const stream = useRef<MediaStream | null>(null);
  const startedAt = useRef(0);
  /**
   * Whether there is a microphone API at all. It is settled after mount, not
   * during render: the server has no `navigator`, so reading it in render
   * makes the server say "no microphone" and the client say "say it", which
   * React rejects as a hydration mismatch and re-renders the whole tree.
   * `false` is the honest first guess — nearly every browser has the API —
   * and a browser that does not gets the skip one tick later.
   */
  const [unsupported, setUnsupported] = useState(false);
  useEffect(() => {
    setUnsupported(
      typeof navigator === "undefined" ||
        !navigator.mediaDevices?.getUserMedia ||
        typeof MediaRecorder === "undefined",
    );
  }, []);

  const cleanup = useCallback(() => {
    if (raf.current) cancelAnimationFrame(raf.current);
    raf.current = null;
    stream.current?.getTracks().forEach((tr) => tr.stop());
    stream.current = null;
  }, []);

  useEffect(
    () => () => {
      cleanup();
      if (take) URL.revokeObjectURL(take.url);
    },
    [cleanup, take],
  );

  const start = useCallback(async () => {
    if (unsupported || state === "recording") return;
    let s: MediaStream;
    try {
      s = await navigator.mediaDevices.getUserMedia({
        audio: {
          channelCount: 1,
          echoCancellation: false,
          noiseSuppression: false,
          autoGainControl: false,
        },
      });
    } catch {
      setDenied(true);
      return;
    }
    stream.current = s;
    const ctx = new AudioContext();
    const analyser = ctx.createAnalyser();
    analyser.fftSize = 1024;
    ctx.createMediaStreamSource(s).connect(analyser);
    const buf = new Float32Array(analyser.fftSize);
    const tick = () => {
      analyser.getFloatTimeDomainData(buf);
      let peak = 0;
      for (const v of buf) peak = Math.max(peak, Math.abs(v));
      setLevel(peak);
      raf.current = requestAnimationFrame(tick);
    };
    tick();
    const chunks: Blob[] = [];
    const mime = MediaRecorder.isTypeSupported("audio/webm;codecs=opus")
      ? "audio/webm;codecs=opus"
      : MediaRecorder.isTypeSupported("audio/mp4")
        ? "audio/mp4"
        : "";
    const r = new MediaRecorder(
      s,
      mime ? { mimeType: mime, audioBitsPerSecond: 128_000 } : undefined,
    );
    r.ondataavailable = (e) => chunks.push(e.data);
    r.onstop = () => {
      const b = new Blob(chunks, { type: r.mimeType });
      setTake((old) => {
        if (old) URL.revokeObjectURL(old.url);
        return {
          blob: b,
          url: URL.createObjectURL(b),
          mime: r.mimeType,
          durationMs: Date.now() - startedAt.current,
        };
      });
      setState("done");
      setLevel(0);
      cleanup();
      void ctx.close();
    };
    rec.current = r;
    startedAt.current = Date.now();
    r.start();
    setState("recording");
  }, [unsupported, state, cleanup]);

  const stop = useCallback(() => {
    if (rec.current && rec.current.state !== "inactive") rec.current.stop();
  }, []);

  const reset = useCallback(() => {
    setTake((old) => {
      if (old) URL.revokeObjectURL(old.url);
      return null;
    });
    setState("idle");
  }, []);

  return { state, level, take, denied, unsupported, start, stop, reset };
}
