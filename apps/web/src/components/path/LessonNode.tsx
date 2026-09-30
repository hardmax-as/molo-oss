import { MAX_CROWN_LEVEL, type PathLessonRow } from "@molo/core";
import { Link } from "@tanstack/react-router";
import { motion } from "motion/react";

import { NodeIcon } from "~/components/path/NodeIcon.tsx";
import { useT } from "~/lib/i18n.tsx";
import { useMotionPrefs } from "~/lib/motion.ts";

/**
 * One stepping stone. A real link when it can be played and a real disabled
 * button when it cannot, so the tab order is the path's own order and a
 * locked stone is announced rather than silently skipped
 * (docs/ACCESSIBILITY.md). The current stone is larger, raised and breathes
 * on its own until motion is reduced.
 */
export function LessonNode({ row }: { row: PathLessonRow }) {
  const t = useT();
  const { reduced } = useMotionPrefs();
  const kind = t(`path.kind.${row.kind}` as never);
  const state =
    row.state === "done"
      ? `${t("path.state.done")}, ${t("path.state.crown", { level: row.crownLevel })}`
      : row.state === "locked"
        ? t("path.state.locked")
        : row.state === "current"
          ? t("path.state.current")
          : t("path.state.open");
  const name = t("path.node", { kind, order: row.order, state });
  const meta = `${t("units.minutes", { count: row.estimatedMinutes })} · ${t("units.exercises", {
    count: row.exerciseCount,
  })}`;

  const size = row.state === "current" ? "h-24 w-24" : "h-[4.5rem] w-[4.5rem]";
  const skin =
    row.state === "locked"
      ? "bg-mist-soft text-mist border-sand-deep"
      : row.state === "done"
        ? "bg-sea text-white border-sea-deep"
        : row.state === "current"
          ? "bg-sun text-indigo border-sun-deep"
          : "bg-cloud text-indigo border-sand-deep";

  const inner = (
    <>
      <span
        className={`pressable flex ${size} items-center justify-center rounded-full border-b-[6px] shadow-card ${skin}`}
      >
        <NodeIcon
          kind={row.kind}
          locked={row.state === "locked"}
          size={row.state === "current" ? 34 : 26}
        />
      </span>
      {row.crownLevel > 0 && (
        <span
          className="absolute -right-1 -top-1 flex h-7 min-w-7 items-center justify-center rounded-full bg-sun px-1.5 font-display text-xs font-bold text-indigo shadow-card"
          aria-hidden
        >
          {row.crownLevel === MAX_CROWN_LEVEL ? "★" : row.crownLevel}
        </span>
      )}
    </>
  );

  return (
    <motion.div
      className="relative"
      initial={reduced ? { opacity: 0 } : { opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{
        duration: reduced ? 0.12 : 0.22,
        ease: [0.22, 1, 0.36, 1],
        delay: reduced ? 0 : Math.min(row.index, 8) * 0.04,
      }}
    >
      {/* The current node breathes so the eye finds it; reduced motion stills it. */}
      {row.state === "current" && !reduced && (
        <span
          className="pointer-events-none absolute inset-0 -z-10 animate-pulse-ring rounded-full bg-sun/50"
          aria-hidden
        />
      )}
      {row.state === "locked" ? (
        <button
          type="button"
          disabled
          className="relative block cursor-not-allowed"
          aria-label={name}
          title={name}
          data-testid="path-node-locked"
        >
          {inner}
        </button>
      ) : (
        <Link
          to="/learn/$slug/$lessonId"
          params={{ slug: row.unitSlug, lessonId: row.lessonId }}
          className="relative block rounded-full"
          aria-label={`${name}. ${meta}`}
          data-testid="path-node"
          data-state={row.state}
        >
          {inner}
        </Link>
      )}
    </motion.div>
  );
}
