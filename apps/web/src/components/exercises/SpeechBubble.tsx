import type { ReactNode } from "react";

import { Crane } from "~/components/illustrations/Crane.tsx";
import { Penguin } from "~/components/illustrations/Penguin.tsx";
import { Sunbird } from "~/components/illustrations/Sunbird.tsx";
import { useT } from "~/lib/i18n.tsx";

/**
 * A sentence is never a line of text in a void: somebody says it. Which
 * mascot depends on what is being asked of the learner (docs/DESIGN.md
 * "Illustration"):
 *
 * - `listening` — the sunbird, the voice: the prompt is something to hear.
 * - `teaching` — the crane, the mentor: the sentence is shown and explained.
 * - `producing` — the penguin, the learner: it is waiting to hear it back.
 *
 * The bubble holds whatever the exercise puts in it — the isiXhosa, the
 * audio button, the word hints. It is used only for sentence prompts;
 * single-word prompts keep their existing, larger layout.
 */
export type PromptSpeaker = "listening" | "teaching" | "producing";

export function SpeechBubble({
  speaker,
  children,
  className = "",
}: {
  speaker: PromptSpeaker;
  children: ReactNode;
  className?: string;
}) {
  const t = useT();
  const label = t(`lesson.speaker.${speaker}` as never);
  return (
    <div className={`mb-6 flex items-end gap-2 sm:gap-3 ${className}`}>
      <div className="shrink-0">
        {speaker === "listening" && <Sunbird pose="listen" size={84} label={label} />}
        {speaker === "teaching" && <Crane pose="hello" size={84} label={label} />}
        {speaker === "producing" && <Penguin pose="listen" size={84} label={label} />}
      </div>
      <div className="relative min-w-0 grow rounded-3xl rounded-bl-md border-2 border-sand-deep bg-sand px-4 py-3 sm:px-5 sm:py-4">
        {/* The tail, pointing back at whoever is speaking. Decoration only. */}
        <span
          className="absolute -left-[9px] bottom-3 h-4 w-4 rotate-45 border-b-2 border-l-2 border-sand-deep bg-sand"
          aria-hidden
        />
        {children}
      </div>
    </div>
  );
}
