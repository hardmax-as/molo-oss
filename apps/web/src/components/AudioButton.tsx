import { Users, Volume2, VolumeX } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import { useT } from "~/lib/i18n.tsx";
import { useSfx } from "~/lib/sfx.tsx";

/**
 * Plays a signed audio URL. Big enough for a thumb (DESIGN.md), pulses
 * while playing, holds UI sounds for the clip's duration, and shows the
 * Forvo attribution when the tier requires it (CONTENT.md section 3).
 */
export interface Voice {
  readonly url: string;
  readonly attribution?: string | null | undefined;
  readonly speaker?: { readonly displayName: string } | null | undefined;
}

export function AudioButton({
  url,
  voices,
  label,
  attribution,
  rate = 1,
  autoPlay = false,
  size = "md",
  tone = "indigo",
  className = "",
  onPlayingChange,
}: {
  url: string | null | undefined;
  /** Every published recording of this word; when more than one, a small switch cycles through them. */
  voices?: readonly Voice[] | undefined;
  label: string;
  attribution?: string | null | undefined;
  rate?: number;
  autoPlay?: boolean;
  size?: "sm" | "md" | "lg";
  tone?: "indigo" | "sun" | "sea";
  className?: string;
  onPlayingChange?: (playing: boolean) => void;
}) {
  const ref = useRef<HTMLAudioElement | null>(null);
  const release = useRef<(() => void) | null>(null);
  const sfx = useSfx();
  const t = useT();
  const [playing, setPlaying] = useState(false);
  const [failed, setFailed] = useState(false);
  const [voiceIndex, setVoiceIndex] = useState(0);
  useEffect(() => () => release.current?.(), []);
  const list = voices && voices.length > 1 ? voices : null;
  const active = list ? list[voiceIndex % list.length] : null;
  const src = active ? active.url : url;
  // A new source gets a fresh chance to play.
  useEffect(() => setFailed(false), [src]);
  const shownAttribution = active ? active.attribution : attribution;
  const dims = { sm: "h-9 w-9", md: "h-12 w-12", lg: "h-16 w-16" }[size];
  const icon = { sm: 16, md: 22, lg: 30 }[size];
  const tones = {
    indigo: "bg-indigo text-white border-indigo-deep",
    sun: "bg-sun text-indigo border-sun-deep",
    sea: "bg-sea text-white border-sea-deep",
  }[tone];
  if (!src) {
    // Still a button-shaped, fully opaque circle: "no audio yet" must not look like a ghost.
    return (
      <span className={`inline-flex items-center gap-2 ${className}`}>
        <span
          role="img"
          aria-label={t("lesson.noAudio")}
          title={t("lesson.noAudio")}
          className={`inline-flex ${dims} items-center justify-center rounded-full border-b-[3px] border-mist-deep bg-mist text-white shadow-card`}
        >
          <VolumeX size={icon} aria-hidden />
        </span>
        {size !== "sm" && (
          <span className="text-xs font-semibold text-mist">{t("lesson.noAudio")}</span>
        )}
      </span>
    );
  }
  const start = (playingNow: boolean) => {
    setPlaying(playingNow);
    onPlayingChange?.(playingNow);
    if (playingNow) release.current ??= sfx.hold();
    else {
      release.current?.();
      release.current = null;
    }
  };
  return (
    <span className={`relative inline-flex items-center gap-2 ${className}`}>
      {playing && (
        <span
          className={`absolute left-0 top-0 ${dims} rounded-full bg-sun/60 animate-pulse-ring`}
          aria-hidden
        />
      )}
      <button
        type="button"
        aria-label={failed ? `${label}: ${t("lesson.audioFailed")}` : label}
        title={failed ? t("lesson.audioFailed") : undefined}
        onClick={() => {
          const a = ref.current;
          if (!a) return;
          a.playbackRate = rate;
          a.currentTime = 0;
          setFailed(false);
          // A source that did not load rejects here; say so on the button
          // instead of leaving an unhandled rejection (MOLO-WEB-1).
          a.play().catch(() => setFailed(true));
        }}
        className={`pressable relative inline-flex ${dims} items-center justify-center rounded-full shadow-card ${tones} ${rate < 1 ? "opacity-80" : ""}`}
      >
        {playing ? (
          <span className="flex h-5 items-end gap-0.5" aria-hidden>
            {[0, 1, 2, 3].map((i) => (
              <span
                key={i}
                className="block w-1 origin-bottom rounded bg-current animate-bars"
                style={{ height: "100%", animationDelay: `${i * 0.12}s` }}
              />
            ))}
          </span>
        ) : failed ? (
          <VolumeX size={icon} aria-hidden />
        ) : (
          <Volume2 size={icon} aria-hidden />
        )}
      </button>
      <audio
        ref={ref}
        src={src}
        crossOrigin={src.includes("b=private") ? "use-credentials" : undefined}
        // Private (editor) audio passes a session check per request, so a page
        // of it must not load every file at once: that exhausted the database
        // connections on 2026-09-27. Public learner audio comes from the CDN.
        preload={src.includes("b=private") ? "none" : "auto"}
        onError={() => setFailed(true)}
        autoPlay={autoPlay}
        onPlay={() => start(true)}
        onEnded={() => start(false)}
        onPause={() => start(false)}
      />
      {rate < 1 && (
        <span className="text-xs font-semibold text-mist">{Math.round(rate * 100)}%</span>
      )}
      {list && (
        <button
          type="button"
          onClick={() => setVoiceIndex((i) => (i + 1) % list.length)}
          title={
            active?.speaker
              ? t("lesson.voiceBy", { name: active.speaker.displayName })
              : t("lesson.otherVoice")
          }
          aria-label={t("lesson.voiceOf", { index: voiceIndex + 1, total: list.length })}
          className="inline-flex h-8 min-w-11 items-center justify-center gap-1 rounded-full border border-mist-soft bg-cloud px-2 text-xs font-semibold text-indigo"
        >
          <Users size={14} aria-hidden />
          <span aria-hidden>
            {voiceIndex + 1}/{list.length}
          </span>
        </button>
      )}
      {shownAttribution && <span className="text-[10px] text-mist">{shownAttribution}</span>}
    </span>
  );
}
