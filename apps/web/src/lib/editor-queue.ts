/**
 * Where each figure on the editor landing page sends an editor.
 *
 * Pure, and free of React and of the router, so the unit suite can hold it
 * to its promise without a browser: every publish-gate refusal has to land
 * somewhere inside `/edit`, and the reasons that have a filter capable of
 * reproducing their rows exactly have to use it.
 */

import type { GateBlockerCount } from "@molo/core";

/**
 * The routes the landing page can send an editor to, and no others — an
 * exhaustive union rather than the router's `LinkProps`, which is generic
 * over the whole tree and would let a typo in a filter name through.
 */
export type Destination =
  | { to: "/edit/content"; search?: Record<string, string | boolean> }
  | { to: "/edit/sentences"; search?: Record<string, string> }
  | { to: "/edit/studio"; search?: { unit: string } }
  | { to: "/edit/curriculum" }
  | { to: "/edit/review" }
  | { to: "/edit/goldens" };

/** The three statuses the landing page counts, as the grid's filter spells them. */
export const CONTENT_PENDING: Destination = {
  to: "/edit/content",
  search: { status: "pending" },
};

/**
 * Where a refusal is fixed. Every gloss and audio reason has a filter that
 * reproduces its rows exactly; the rest land on the list that holds them,
 * because a link to roughly the right place still beats reading a number.
 */
export function blockerDestination(g: GateBlockerCount): Destination {
  if (g.kind === "sentence") {
    if (g.code === "gloss_missing")
      return {
        to: "/edit/sentences",
        search: { status: "pending", missingGloss: g.detail ?? "any" },
      };
    if (g.code === "audio_missing") return { to: "/edit/studio" };
    return { to: "/edit/sentences", search: { status: "pending" } };
  }
  if (g.code === "gloss_missing")
    return { to: "/edit/content", search: { status: "pending", missingGloss: g.detail ?? "all" } };
  if (g.code === "audio_missing")
    return { to: "/edit/content", search: { status: "pending", missingAudio: true } };
  // A class xh-morph cannot inflect is unblocked on the goldens sheet, not
  // on any one word: the tutor validates the class and every word follows.
  if (g.code === "plural_not_generable" || g.code === "no_morphology_generator")
    return { to: "/edit/goldens" };
  if (g.code === "noun_class_missing")
    return { to: "/edit/content", search: { status: "pending", pos: "noun" } };
  return CONTENT_PENDING;
}
