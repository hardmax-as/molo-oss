import type { PathChestRow } from "@molo/core";
import { Gift, Lock } from "lucide-react";
import { motion } from "motion/react";
import { useState } from "react";

import { useT } from "~/lib/i18n.tsx";
import { useMotionPrefs } from "~/lib/motion.ts";
import { useSfx } from "~/lib/sfx.tsx";

/**
 * The reward at the end of a skill. It opens once, and only once: the claim
 * is a row in `skill_chests` on the server (or the device copy for a
 * guest, replayed at sign-up), so replaying a lesson cannot farm it. A
 * claimed chest stays on the path as a marker of what was finished.
 */
export function ChestNode({
  row,
  onClaim,
  busy,
}: {
  row: PathChestRow;
  onClaim: (skillId: string) => void;
  busy: boolean;
}) {
  const t = useT();
  const sfx = useSfx();
  const { reduced } = useMotionPrefs();
  const [popped, setPopped] = useState(false);
  const skill = t(row.titleKey as never) || row.skillId;

  const name =
    row.state === "ready"
      ? t("path.chest.ready", { xp: row.xp })
      : row.state === "claimed"
        ? t("path.chest.claimed", { xp: row.xp })
        : t("path.chest.locked", { skill });

  const skin =
    row.state === "ready"
      ? "bg-sun text-indigo border-sun-deep"
      : row.state === "claimed"
        ? "bg-sea-soft text-sea-deep border-sea/40"
        : "bg-mist-soft text-mist border-sand-deep";

  return (
    <motion.div
      className="relative"
      initial={reduced ? { opacity: 0 } : { opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: reduced ? 0.12 : 0.22, ease: [0.22, 1, 0.36, 1] }}
    >
      {row.state === "ready" && !reduced && (
        <span
          className="pointer-events-none absolute inset-0 -z-10 animate-pulse-ring rounded-2xl bg-sun/50"
          aria-hidden
        />
      )}
      <button
        type="button"
        disabled={row.state !== "ready" || busy}
        aria-label={busy ? t("path.chest.opening") : name}
        title={name}
        data-testid="path-chest"
        data-state={row.state}
        onClick={() => {
          if (row.state !== "ready") return;
          setPopped(true);
          sfx.play("crown");
          onClaim(row.skillId);
        }}
        className={`pressable flex h-16 w-20 items-center justify-center rounded-2xl border-b-[6px] shadow-card disabled:cursor-not-allowed ${skin} ${
          popped && !reduced ? "animate-pop" : ""
        }`}
      >
        {row.state === "locked" ? <Lock size={24} aria-hidden /> : <Gift size={26} aria-hidden />}
      </button>
      {row.state !== "locked" && (
        <span
          className={`mt-1 block text-center font-display text-xs font-bold ${
            row.state === "ready" ? "text-ochre-deep" : "text-sea-deep"
          }`}
          aria-hidden
        >
          {t("path.chest.reward", { xp: row.xp })}
        </span>
      )}
    </motion.div>
  );
}
