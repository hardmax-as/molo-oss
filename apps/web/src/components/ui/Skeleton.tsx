import type { ReactNode } from "react";

import { PathSkeletonShape } from "~/components/path/PathTrail.tsx";
import { useT } from "~/lib/i18n.tsx";

/**
 * What a learner page shows in the rare case it has nothing to draw yet
 * (docs/CACHING.md section 2.0): the page's own shape in quiet blocks at the
 * sizes the real thing takes, so nothing jumps when it arrives. Most visits
 * never see it — pages draw from memory, and the links that lead to them
 * prefetch on hover — so this is the cold path, not the normal one.
 *
 * The pulse is Tailwind's `animate-pulse`, which the reduced-motion rules in
 * styles.css already stop for the OS setting and for the Settings override,
 * so the markup is the same on the server and in the browser. A screen reader
 * hears one "Loading" for the whole shape.
 */

/** One block, sized (and, if it is not the usual rounded-2xl, rounded) by its classes. */
export function Bone({
  className = "",
  tone = "sand",
}: {
  className?: string;
  tone?: "sand" | "cloud";
}) {
  const round = /(^|\s)rounded-/.test(className) ? "" : "rounded-2xl";
  return (
    <span
      aria-hidden
      className={`block animate-pulse ${round} ${tone === "cloud" ? "bg-sand" : "bg-sand-deep"} ${className}`}
    />
  );
}

function Shape({
  children,
  className = "",
  testId,
}: {
  children: ReactNode;
  className?: string;
  testId: string;
}) {
  const t = useT();
  return (
    <div role="status" aria-busy="true" className={className} data-testid={testId}>
      <span className="sr-only">{t("common.loading")}</span>
      {children}
    </div>
  );
}

/**
 * The start of the path: the path's own skeleton (PathTrail), so a page that
 * is still waiting draws the same winding, trail and all, that its path will.
 */
function Trail() {
  return <PathSkeletonShape />;
}

/** Home: the landscape, the title, then the start of the path. */
export function HomeSkeleton() {
  return (
    <Shape testId="home-loading">
      <Bone className="-mx-4 -mt-6 mb-8 h-40 rounded-b-[2rem] rounded-t-none sm:-mx-6 sm:h-48" />
      <div className="mb-8 space-y-2">
        <Bone className="h-10 w-56" />
        <Bone className="h-5 w-72 max-w-full" />
      </div>
      <Trail />
    </Shape>
  );
}

/** A unit page: the stretch of path under its sticky header. */
export function UnitPageSkeleton() {
  return (
    <Shape testId="unit-loading">
      <Trail />
    </Shape>
  );
}

/** The review and mistakes sessions: the progress line, the bar, and the recall card. */
export function RecallSkeleton({ answers = 4 }: { answers?: number }) {
  return (
    <Shape testId="recall-loading" className="mx-auto max-w-2xl">
      <div className="mb-4 flex items-center justify-between">
        <Bone className="h-5 w-40" />
        <Bone className="h-6 w-24" />
      </div>
      <Bone className="mb-4 h-3 w-full rounded-full" />
      <div className="rounded-3xl bg-cloud p-8 shadow-pop">
        <Bone tone="cloud" className="mb-4 h-4 w-32" />
        <div className="mb-6 flex items-center gap-4">
          <Bone tone="cloud" className="h-12 w-12 rounded-full" />
          <Bone tone="cloud" className="h-12 w-48" />
        </div>
        <div
          className={`mt-6 grid gap-3 ${answers > 2 ? "grid-cols-2 sm:grid-cols-4" : "sm:grid-cols-2"}`}
        >
          {Array.from({ length: answers }, (_, i) => (
            <Bone key={i} tone="cloud" className="h-12" />
          ))}
        </div>
      </div>
    </Shape>
  );
}

/** Leagues: the cohort card, then the standings. */
export function LeagueSkeleton({ rows = 6 }: { rows?: number }) {
  return (
    <Shape testId="league-loading" className="mx-auto max-w-2xl">
      <Bone className="mb-6 h-44 rounded-3xl" />
      <div className="space-y-2">
        {Array.from({ length: rows }, (_, i) => (
          <Bone key={i} className="h-14" />
        ))}
      </div>
    </Shape>
  );
}
