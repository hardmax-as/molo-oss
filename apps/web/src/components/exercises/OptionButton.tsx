import { motion } from "motion/react";
import type { ReactNode } from "react";

import { useT } from "~/lib/i18n.tsx";
import { shakeKeyframes, shakeTransition, useMotionPrefs } from "~/lib/motion.ts";
import { useSfx } from "~/lib/sfx.tsx";

export type OptionState = "" | "picked" | "right" | "wrong";

/**
 * One answer tile. Picked: indigo edge. Right: sea. Wrong: coral and three
 * shakes (DESIGN.md). Plays the tap sound on pick.
 */
export function OptionButton({
  state,
  disabled,
  onClick,
  children,
  className = "",
  size = "md",
}: {
  state: OptionState;
  disabled: boolean;
  onClick: () => void;
  children: ReactNode;
  className?: string;
  size?: "md" | "lg";
}) {
  const { reduced } = useMotionPrefs();
  const sfx = useSfx();
  const t = useT();
  // The verdict is carried by colour and a shake; a screen reader gets it in
  // words too (WCAG 1.4.1, "use of colour").
  const verdict =
    state === "right" ? t("lesson.rightAnswer") : state === "wrong" ? t("lesson.incorrect") : null;
  const look = {
    "": "border-mist-soft bg-cloud text-ink hover:bg-sand",
    picked: "border-indigo bg-indigo-soft/10 text-indigo",
    right: "border-sea bg-sea-soft text-sea-deep",
    wrong: "border-coral bg-coral-soft text-coral-deep",
  }[state];
  const pad = size === "lg" ? "px-5 py-4 text-2xl" : "px-4 py-3 text-lg";
  return (
    <motion.button
      type="button"
      disabled={disabled}
      aria-pressed={state === "picked"}
      onClick={() => {
        sfx.play("tap");
        onClick();
      }}
      animate={state === "wrong" && !reduced ? shakeKeyframes : { x: 0 }}
      transition={shakeTransition}
      {...(disabled || reduced ? {} : { whileTap: { scale: 0.97 } })}
      className={`min-h-11 w-full rounded-2xl border-2 border-b-4 text-left font-semibold shadow-card disabled:cursor-default ${pad} ${look} ${className}`}
    >
      {children}
      {verdict && <span className="sr-only"> — {verdict}</span>}
    </motion.button>
  );
}
