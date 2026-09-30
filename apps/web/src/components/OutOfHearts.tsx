import { Link } from "@tanstack/react-router";
import { Heart } from "lucide-react";
import { useEffect, useState } from "react";

import { Penguin } from "~/components/illustrations/Penguin.tsx";
import { Button, ButtonLink } from "~/components/ui/Button.tsx";
import type { HeartsState } from "~/lib/api.ts";
import { useFocusOnMount } from "~/lib/focus.ts";
import { useT } from "~/lib/i18n.tsx";

function countdown(iso: string | null, now: number): string {
  if (!iso) return "";
  const ms = Math.max(0, new Date(iso).getTime() - now);
  const h = Math.floor(ms / 3_600_000);
  const m = Math.floor((ms % 3_600_000) / 60_000);
  return h > 0 ? `${h} h ${m} min` : `${m} min`;
}

/**
 * Shown when a lesson cannot continue: practise for a heart, wait, or get
 * Plus. It interrupts what the learner was doing, so it is an `alert` — the
 * one assertive announcement in the app — and it takes focus.
 */
export function OutOfHearts({ state, onLeave }: { state: HeartsState; onLeave?: () => void }) {
  const t = useT();
  const heading = useFocusOnMount<HTMLHeadingElement>();
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(id);
  }, []);
  return (
    <section
      className="mx-auto max-w-lg rounded-3xl bg-cloud p-8 text-center shadow-card"
      role="alert"
      aria-labelledby="hearts-title"
    >
      <div className="mb-2 flex justify-center">
        <Penguin pose="sleep" size={130} />
      </div>
      <p
        className="mb-2 flex items-center justify-center gap-1 text-coral-deep"
        role="img"
        aria-label={t("hearts.count", { hearts: state.hearts, max: state.max })}
      >
        {Array.from({ length: state.max }, (_, i) => (
          <Heart
            key={i}
            size={22}
            aria-hidden
            className={i < state.hearts ? "fill-coral" : "opacity-30"}
          />
        ))}
      </p>
      <h1
        id="hearts-title"
        ref={heading}
        tabIndex={-1}
        className="font-display text-2xl font-bold text-indigo"
      >
        {t("hearts.outTitle")}
      </h1>
      {/* A clock. The server reads `Date.now()` when it renders and the
          browser reads it again when it hydrates, so the two disagree
          whenever those instants straddle a minute — which React reports as
          a hydration mismatch. The countdown is the one place in the app
          where that is expected rather than a bug. */}
      <p className="mt-1 text-mist" suppressHydrationWarning>
        {state.nextRegenAt
          ? t("hearts.nextIn", { time: countdown(state.nextRegenAt, now) })
          : t("hearts.outBody")}
      </p>
      <div className="mt-6 flex flex-col gap-3">
        <ButtonLink to="/review" variant="sea" size="lg">
          {t("hearts.practise", { count: state.practiceLeft })}
        </ButtonLink>
        <ButtonLink to="/plus" size="lg">
          {t("hearts.getPlus")}
        </ButtonLink>
        {onLeave && (
          <Button variant="ghost" onClick={onLeave}>
            {t("hearts.later")}
          </Button>
        )}
      </div>
      <p className="mt-4 text-xs text-mist">
        <Link to="/plus" className="underline">
          {t("hearts.why")}
        </Link>
      </p>
    </section>
  );
}
