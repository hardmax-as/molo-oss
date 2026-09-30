import {
  createLinkDrawMemory,
  LINK_DASH_START,
  LINK_STYLE,
  linkDrawWindow,
  linkHalf,
  type LinkState,
  type NodeLinks,
  type NodeOffset,
  type PathLink,
  type PathStopRow,
} from "@molo/core";
import { motion } from "motion/react";
import { useEffect, useRef } from "react";

import { useMotionPrefs } from "~/lib/motion.ts";

/**
 * The trail between the nodes (docs/DESIGN.md "The path"). Every row draws
 * its own halves of the links to the stops above and below it, and the two
 * halves of a link meet on the edge the rows share. Drawn per row and never
 * as one SVG over the whole path, so a long path costs what its rows cost;
 * the geometry is `linkHalf` in @molo/core, the same curve mobile draws.
 */

/**
 * Row edge to the node's centre at the default text size: the row's `py-3`
 * plus half the node (`h-[4.5rem]`, the current node's `h-24`, the chest's
 * `h-16`, which sits at the top of its column above the reward label).
 */
export const LINK_REACH = { lesson: 12 + 36, current: 12 + 48, chest: 12 + 32 } as const;

export function linkReachOf(row: PathStopRow): number {
  if (row.type === "chest") return LINK_REACH.chest;
  return row.state === "current" ? LINK_REACH.current : LINK_REACH.lesson;
}

/** Far enough to reach the row's middle in any row; the SVG box clips the rest. */
const RUN_END = 400;

/** Walked is the done colour; the rest is mist on sand, opaque so the two halves never double up. */
function strokeOf(state: LinkState): string {
  if (state === "done") return "var(--color-sea)";
  const mist = state === "ahead" ? 45 : 22;
  return `color-mix(in srgb, var(--color-mist) ${mist}%, var(--color-sand))`;
}

const memory = createLinkDrawMemory();

/**
 * The newest walked link draws itself on once, the first time this browser
 * sees it walked (after a lesson, not on every visit). Under reduced motion
 * it is simply there. Imperative, on the element, so a re-render of the
 * path never restarts it.
 */
function useDrawOn(link: PathLink, half: keyof NodeLinks, length: number) {
  const ref = useRef<SVGPathElement | null>(null);
  const { reduced } = useMotionPrefs();
  const drawable = link.latest && link.state === "done";
  const { key, unitId } = link;
  useEffect(() => {
    const el = ref.current;
    if (!drawable || !el || typeof el.animate !== "function") return;
    const now = Date.now();
    const started = memory.start({ key, unitId }, now);
    if (started === null || reduced) return;
    const turn = linkDrawWindow(half, started, now);
    if (!turn) return;
    const full = Math.ceil(length) + 1;
    // Each half's path starts at the shared row edge. The upper stop's half
    // grows from its node towards that edge (from the path's end), the lower
    // stop's from the edge towards its node (from the path's start).
    const hidden = half === "below" ? -full : full;
    el.style.strokeDasharray = `${full} ${full}`;
    const animation = el.animate(
      [{ strokeDashoffset: String(hidden) }, { strokeDashoffset: "0" }],
      {
        duration: turn.duration,
        delay: turn.delay,
        easing: half === "below" ? "ease-in" : "ease-out",
        fill: "both",
      },
    );
    return () => {
      animation.cancel();
      el.style.strokeDasharray = "";
    };
  }, [drawable, key, unitId, half, length, reduced]);
  return ref;
}

/**
 * One half of a link, in a box as tall as half the row: the top half for
 * the link arriving from above, the bottom half (the same drawing, flipped)
 * for the link leaving below. The curve reaches the node's centre at
 * `reach`; a straight run carries on to the row's middle, so a row that
 * grows taller than expected still meets its node.
 */
function LinkHalfSvg({
  link,
  half,
  self,
  reach,
}: {
  link: PathLink;
  half: keyof NodeLinks;
  self: NodeOffset;
  reach: number;
}) {
  const curve = linkHalf({ self, other: half === "above" ? link.from : link.to, reach });
  const ref = useDrawOn(link, half, curve.length);
  const x = curve.points[3].x;
  const dashed = link.state !== "done";
  const dash = dashed ? `${LINK_STYLE.dash} ${LINK_STYLE.gap}` : undefined;
  return (
    <svg
      className={`absolute left-1/2 -ml-16 h-1/2 w-32 overflow-hidden ${
        half === "above" ? "top-0" : "bottom-0 -scale-y-100"
      }`}
      // A viewBox one unit tall and `meet` scale the drawing with the box's
      // rem width, so it grows with the text size exactly as the nodes do.
      viewBox={`0 0 ${LINK_STYLE.width} 1`}
      preserveAspectRatio="xMidYMin meet"
      fill="none"
      strokeWidth={LINK_STYLE.stroke}
      strokeLinecap="round"
      style={{ stroke: strokeOf(link.state) }}
      data-state={link.state}
    >
      <path
        ref={ref}
        d={curve.d}
        strokeDasharray={dash}
        strokeDashoffset={dashed ? LINK_DASH_START : undefined}
      />
      <line
        x1={x}
        y1={reach}
        x2={x}
        y2={RUN_END}
        strokeDasharray={dash}
        strokeDashoffset={dashed ? curve.runDashOffset : undefined}
      />
    </svg>
  );
}

/**
 * The trail behind one row's node. Put it first inside a `relative isolate`
 * row: it sits under everything else in the row, the node's own halo
 * included, and fades in with the node.
 */
export function PathLinks({
  links,
  self,
  reach,
  index,
}: {
  links: NodeLinks | undefined;
  self: NodeOffset;
  reach: number;
  index: number;
}) {
  const { reduced } = useMotionPrefs();
  if (!links || (!links.above && !links.below)) return null;
  return (
    <motion.div
      aria-hidden
      className="pointer-events-none absolute inset-0 -z-10"
      data-testid="path-link"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{
        duration: reduced ? 0.12 : 0.22,
        delay: reduced ? 0 : Math.min(index, 8) * 0.04,
      }}
    >
      {links.above && <LinkHalfSvg link={links.above} half="above" self={self} reach={reach} />}
      {links.below && <LinkHalfSvg link={links.below} half="below" self={self} reach={reach} />}
    </motion.div>
  );
}
