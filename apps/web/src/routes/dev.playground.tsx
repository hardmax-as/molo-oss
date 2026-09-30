import { celebrationBeats, EXERCISE_TYPES, type ExercisePayload } from "@molo/core";
import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";

import { Celebration } from "~/components/celebration/Celebration.tsx";
import { LessonRunner } from "~/components/exercises/Runner.tsx";
import { LevelUp } from "~/components/LevelUp.tsx";
import { Button } from "~/components/ui/Button.tsx";
import { StreakFlame } from "~/components/ui/StreakFlame.tsx";
import { XpChip } from "~/components/ui/XpChip.tsx";
import { DEMO_CONTENT, DEMO_PAYLOADS, EXERCISE_ORDER, EXTRAS } from "~/dev/fixtures.ts";

/**
 * Dev-only playground: every exercise type on the `zz-` fixture content in
 * `~/dev/fixtures.ts`, plus the celebration moments, so the learner UI can be
 * checked without published content or a database. The gate is `/dev`'s
 * layout route; the developer gallery at `/dev` links here.
 */
export const Route = createFileRoute("/dev/playground")({
  validateSearch: (search: Record<string, unknown>): { only?: ExercisePayload["type"] } => {
    const only = search["only"];
    return typeof only === "string" && EXERCISE_TYPES.includes(only as ExercisePayload["type"])
      ? { only: only as ExercisePayload["type"] }
      : {};
  },
  component: Playground,
});

function Playground() {
  const [key, setKey] = useState(0);
  const [level, setLevel] = useState<number | null>(null);
  // The celebration on its own, without answering ten exercises first.
  const [celebrating, setCelebrating] = useState(false);
  // `?only=concord_fill` runs one type, so a screenshot or a spec can go
  // straight to the widget it cares about instead of answering its way there.
  const only = Route.useSearch().only;
  const exercises = EXERCISE_ORDER.filter((type) => !only || type === only).map((type, i) => ({
    id: `zz-${i}-${type}`,
    type,
    payload: DEMO_PAYLOADS[type],
    // The badge is a lesson payload field; the playground fakes one so the
    // moment above the prompt can be seen without a database.
    moment: i === 0 ? ("new_word" as const) : null,
  }));
  return (
    <section className="space-y-6">
      <div className="flex flex-wrap items-center gap-3 rounded-3xl bg-cloud p-4 shadow-card">
        <span className="font-display text-lg font-bold text-indigo">Playground</span>
        <Button size="sm" variant="outline" onClick={() => setKey((k) => k + 1)}>
          restart
        </Button>
        <Button size="sm" variant="indigo" onClick={() => setLevel(3)}>
          level up
        </Button>
        <Button size="sm" variant="sea" onClick={() => setCelebrating(true)}>
          celebration
        </Button>
        <XpChip value={120} delta />
        <StreakFlame days={7} label="7 day streak" />
      </div>
      <LessonRunner
        key={key}
        exercises={exercises}
        content={DEMO_CONTENT}
        onFinish={() => undefined}
        onLeave={() => setKey((k) => k + 1)}
        extras={EXTRAS}
      />
      {celebrating && (
        <Celebration
          beats={celebrationBeats({ xp: 120, correct: 8, total: 8, ...EXTRAS })}
          onDone={() => setCelebrating(false)}
        />
      )}
      <LevelUp level={level} onClose={() => setLevel(null)} />
    </section>
  );
}
