import {
  currentNodeKey,
  nodeOffsetOf,
  pathLinks,
  type NodeLinks,
  type NodeOffset,
  type PathLink,
} from "@molo/core";
import { useEffect, useState } from "react";

import { Penguin } from "~/components/illustrations/Penguin.tsx";
import { SkillGlyph } from "~/components/illustrations/SkillGlyph.tsx";
import { ChestNode } from "~/components/path/ChestNode.tsx";
import { LessonNode } from "~/components/path/LessonNode.tsx";
import { PathGuide } from "~/components/path/PathGuide.tsx";
import { LINK_REACH, linkReachOf, PathLinks } from "~/components/path/PathLink.tsx";
import { UnitBanner } from "~/components/path/UnitBanner.tsx";
import { UnitWords } from "~/components/path/UnitWords.tsx";
import { Card } from "~/components/ui/Card.tsx";
import { localToday } from "~/lib/api.ts";
import { useT } from "~/lib/i18n.tsx";
import { useWave } from "~/lib/motion.ts";
import { resolveSpeech, type GuideSpeech } from "~/lib/path-guide.ts";
import { useLearningPath } from "~/lib/path.ts";

/**
 * How far off the spine a node sits, in the order buildPath assigns. Kept
 * small enough that the widest node plus its shift still fits a 320 px
 * viewport at 400 % zoom without the page scrolling sideways. The trail's
 * geometry (`LINK_STYLE.shift` in @molo/core) assumes the same 3.5rem.
 */
const SHIFT = { "-1": "-translate-x-14", "0": "translate-x-0", "1": "translate-x-14" } as const;

/** Nothing published yet: the penguin says so rather than an empty page, and waves hello. */
function EmptyPath() {
  const t = useT();
  const greet = useWave();
  return (
    <Card
      tone="sand"
      className="flex flex-col items-center gap-3 text-center text-mist"
      onPointerEnter={greet.trigger}
      onPointerDown={greet.trigger}
    >
      <Penguin pose="think" size={120} wave={greet.wave} />
      {t("units.empty")}
    </Card>
  );
}

/** The winding the skeleton shows: the first four offsets buildPath hands out. */
const SKELETON: readonly NodeOffset[] = [0, 1, 0, -1];

function skeletonLinks(i: number): NodeLinks {
  const link = (upper: number): PathLink => ({
    key: `skeleton:${upper}`,
    unitId: "skeleton",
    from: SKELETON[upper] ?? 0,
    to: SKELETON[upper + 1] ?? 0,
    state: "ahead",
    latest: false,
  });
  return {
    above: i > 0 ? link(i - 1) : null,
    below: i < SKELETON.length - 1 ? link(i) : null,
  };
}

/**
 * While the path loads: the shape of what is coming, measured like the
 * real thing (a unit header, a skill title, four nodes on the winding with
 * the trail between them) so nothing jumps when it arrives. A screen
 * reader hears "Loading" once; the shapes are hidden from it.
 */
function PathSkeleton() {
  const t = useT();
  return (
    <div role="status" aria-busy="true" data-testid="path-skeleton">
      <span className="sr-only">{t("common.loading")}</span>
      <PathSkeletonShape />
    </div>
  );
}

/**
 * The drawing alone, without the "Loading" a screen reader hears, for a page
 * skeleton that says it once for the whole page (ui/Skeleton.tsx). One
 * drawing for both, so a page and the path it waits for never disagree.
 */
export function PathSkeletonShape() {
  return (
    <div aria-hidden className="animate-pulse">
      <div className="-mx-4 px-4 pb-3 pt-2 sm:-mx-6 sm:px-6">
        <div className="h-[4.25rem] rounded-2xl bg-mist-soft" />
      </div>
      <div className="flex items-center justify-center gap-2 py-4">
        <span className="block h-7 w-7 rounded-full bg-mist-soft" />
        <span className="block h-4 w-32 rounded-full bg-mist-soft" />
      </div>
      <ol>
        {SKELETON.map((offset, i) => (
          <li key={i} className="relative isolate flex items-center justify-center py-3">
            <PathLinks links={skeletonLinks(i)} self={offset} reach={LINK_REACH.lesson} index={i} />
            <span
              className={`block h-[4.5rem] w-[4.5rem] rounded-full border-b-[6px] border-sand-deep bg-mist-soft ${SHIFT[String(offset) as "0"]}`}
            />
          </li>
        ))}
      </ol>
    </div>
  );
}

/**
 * The path: one continuous route through the course rather than a grid of
 * cards. Units are stretches with a header that travels with the learner,
 * skills are runs of nodes joined by a trail, and each skill ends in a chest.
 *
 * Rendering is a flat list of rows from `buildPath`, so the DOM order is
 * the walking order — which is also the tab order (docs/ACCESSIBILITY.md).
 * `slug` narrows the path to one unit for the unit page.
 */
export function PathTrail({
  slug,
  headingLevel = "h2",
}: {
  slug?: string;
  headingLevel?: "h1" | "h2";
}) {
  const t = useT();
  const path = useLearningPath(slug);
  const [words, setWords] = useState<{ slug: string; title: string } | null>(null);
  const [speech, setSpeech] = useState<GuideSpeech>(null);

  // In an effect, not in render: localStorage does not exist on the server,
  // and the markup has to match what the server sent before it changes.
  useEffect(() => setSpeech(resolveSpeech(localToday())), []);

  if (path.isPending) return <PathSkeleton />;
  if (path.isError) return <p className="text-coral-deep">{t("common.error")}</p>;
  // Nothing published yet: the penguin says so rather than an empty page.
  if (path.rows.length === 0) return <EmptyPath />;

  const here = currentNodeKey(path.rows);
  // `buildPath` runs on every render, so this is no dearer than the rows.
  const links = pathLinks(path.rows);
  const titleOf = (key: string, fallback: string) => t(key as never) || fallback;
  // Skills sit one level under their unit, so the outline reads as an outline.
  const SkillHeading = headingLevel === "h1" ? "h2" : "h3";

  return (
    <>
      <nav aria-label={t("path.sectionNav")} data-testid="path">
        <ol>
          {path.rows.map((row) => {
            if (row.type === "unit")
              return (
                <li key={row.key}>
                  <UnitBanner
                    row={row}
                    as={headingLevel}
                    onOpenWords={(s) =>
                      setWords({ slug: s, title: titleOf(row.titleKey, row.unitSlug) })
                    }
                  />
                </li>
              );
            // The trail breaks at a skill's title rather than crossing it:
            // the chest above closed the last skill, this row opens the next.
            if (row.type === "skill")
              return (
                <li key={row.key} className="flex items-center justify-center gap-2 py-4">
                  <SkillGlyph kind={row.kind} size={28} />
                  <SkillHeading className="font-display text-base font-semibold text-mist">
                    {titleOf(row.titleKey, row.skillId)}
                  </SkillHeading>
                </li>
              );
            // Chests sit on the spine: the reward is the pause in the winding.
            const offset = nodeOffsetOf(row);
            return (
              <li key={row.key} className="relative isolate flex items-center justify-center py-3">
                <PathLinks
                  links={links.get(row.key)}
                  self={offset}
                  reach={linkReachOf(row)}
                  index={row.index}
                />
                <div className={`relative flex items-center gap-3 ${SHIFT[String(offset) as "0"]}`}>
                  {row.type === "lesson" ? (
                    <LessonNode row={row} />
                  ) : (
                    <ChestNode
                      row={row}
                      busy={path.claiming === row.skillId}
                      onClaim={path.claim}
                    />
                  )}
                  {here === row.key && (
                    <div className="absolute left-full ml-1 hidden sm:block">
                      <PathGuide speak={speech} />
                    </div>
                  )}
                </div>
              </li>
            );
          })}
        </ol>
      </nav>
      {words && <UnitWords slug={words.slug} title={words.title} onClose={() => setWords(null)} />}
    </>
  );
}
