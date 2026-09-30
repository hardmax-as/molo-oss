import { createFileRoute } from "@tanstack/react-router";

import { Crane } from "~/components/illustrations/Crane.tsx";
import { Penguin } from "~/components/illustrations/Penguin.tsx";
import { Sunbird, type SunbirdPose } from "~/components/illustrations/Sunbird.tsx";

export const Route = createFileRoute("/dev/mascots")({ component: Mascots });

const POSES: SunbirdPose[] = ["hello", "cheer", "think", "sleep", "listen"];

/** Dev-only: the trio in every pose and on every surface. The gate is `/dev`'s layout route. */
function Mascots() {
  const rows = [
    ["The sunbird (the voice)", Sunbird],
    ["The penguin (the learner)", Penguin],
    ["The crane (the mentor)", Crane],
  ] as const;
  return (
    <div className="space-y-8">
      {rows.map(([name, C]) => (
        <section key={name} className="rounded-3xl bg-cloud p-6 shadow-card">
          <h2 className="mb-2 font-display text-2xl font-bold text-indigo">{name}</h2>
          <div className="flex flex-wrap items-end gap-6">
            {POSES.map((p) => (
              <figure key={p} className="text-center">
                <C pose={p} size={150} />
                <figcaption className="text-xs text-mist">{p}</figcaption>
              </figure>
            ))}
            <figure className="rounded-2xl bg-indigo p-4 text-center">
              <C pose="cheer" size={110} />
              <figcaption className="text-xs text-white/70">on indigo</figcaption>
            </figure>
            <figure className="rounded-2xl bg-sun p-4 text-center">
              <C pose="hello" size={110} />
              <figcaption className="text-xs text-indigo/70">on sun</figcaption>
            </figure>
          </div>
        </section>
      ))}
      <section className="flex items-end justify-center gap-2 rounded-3xl bg-sand p-6">
        <Sunbird pose="listen" size={150} />
        <Penguin pose="think" size={170} />
        <Crane pose="hello" size={190} />
      </section>
    </div>
  );
}
