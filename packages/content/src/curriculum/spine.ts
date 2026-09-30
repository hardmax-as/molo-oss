/**
 * The curriculum spine: `curriculum/spine.json` and `curriculum/themes.json`,
 * decoded and validated.
 *
 * The files are the editors' surface (see `curriculum/README.md`); this module
 * is only the contract they have to satisfy and the reader that enforces it.
 * Nothing here decides anything about the course — a change of pedagogy is a
 * change to the JSON, not to this file.
 */

import { Either, Schema } from "effect";

const Localised = Schema.Struct({
  en: Schema.NonEmptyString,
  nb: Schema.NonEmptyString,
});
export type Localised = typeof Localised.Type;

const Slug = Schema.String.pipe(Schema.pattern(/^[a-z][a-z0-9-]*$/));

const SkillSchema = Schema.Struct({
  slug: Slug,
  order: Schema.Int.pipe(Schema.positive()),
  kind: Schema.Literal("vocab", "grammar", "pronunciation", "culture"),
  /** Key into `themes.json`; the only thing the word matcher reads. */
  theme: Schema.String.pipe(Schema.minLength(1)),
  targetNewWords: Schema.Int.pipe(Schema.positive()),
  titleKey: Schema.String.pipe(Schema.minLength(1)),
  /** The can-do title, mirrored from packages/i18n so the file reads on its own. */
  title: Localised,
  /** An editor's note in English about the grammar point. Never learner copy. */
  grammar: Schema.String.pipe(Schema.minLength(1)),
  /**
   * Pronunciation skills only: the bare-click sets (`CLICK_IDENTIFY_SETS`)
   * whose `click_identify` exercises open the skill, in their own first
   * lesson, before any word is taught.
   */
  clickIdentifySets: Schema.optional(Schema.Array(Schema.Literal("A", "B", "C", "D", "E"))),
});
export type SpineSkill = typeof SkillSchema.Type;

const UnitSchema = Schema.Struct({
  slug: Slug,
  order: Schema.Int.pipe(Schema.positive()),
  cefrBand: Schema.Literal("A1", "A2", "B1"),
  titleKey: Schema.String.pipe(Schema.minLength(1)),
  title: Localised,
  skills: Schema.Array(SkillSchema).pipe(Schema.minItems(1)),
});
export type SpineUnit = typeof UnitSchema.Type;

export const SpineSchema = Schema.Struct({
  /** The "this is a proposal" preamble. Required: a spine with no caveat is a lie. */
  header: Schema.Array(Schema.String).pipe(Schema.minItems(1)),
  version: Schema.Int,
  course: Schema.String.pipe(Schema.minLength(1)),
  units: Schema.Array(UnitSchema).pipe(Schema.minItems(1)),
});
export type Spine = typeof SpineSchema.Type;

const ThemeSchema = Schema.Struct({
  note: Schema.String.pipe(Schema.minLength(1)),
  /** Matched against the Gothenburg corpus's own `sense` attribute. Evidence 2. */
  senses: Schema.Array(Schema.String),
  /** Matched as whole words or phrases inside an English gloss. Evidence 1. */
  keywords: Schema.Array(Schema.String),
  /** Matched against the isiXhosa lemma. Only the pronunciation theme uses this. */
  lemmaPatterns: Schema.optional(Schema.Array(Schema.String)),
  /** When present, the theme accepts only these parts of speech. */
  pos: Schema.optional(Schema.Array(Schema.String)),
  /** A gloss containing any of these vetoes the theme outright. */
  exclude: Schema.Array(Schema.String),
  /**
   * When present, a lemma of more words than this vetoes the theme (words
   * are split on spaces and slashes). A dictionary phrase such as a hospital
   * department's name is never a beginner's example of a sound or a greeting.
   */
  maxLemmaWords: Schema.optional(Schema.Int.pipe(Schema.positive())),
});
export type Theme = typeof ThemeSchema.Type;

export const ThemeMapSchema = Schema.Struct({
  header: Schema.Array(Schema.String).pipe(Schema.minItems(1)),
  version: Schema.Int,
  themes: Schema.Record({ key: Schema.String, value: ThemeSchema }),
});
export type ThemeMap = typeof ThemeMapSchema.Type;

const decodeSpine = Schema.decodeUnknownEither(SpineSchema);
const decodeThemes = Schema.decodeUnknownEither(ThemeMapSchema);

/** One skill with the unit it belongs to, in teaching order. Flattened once, used everywhere. */
export interface SpinePosition {
  readonly unit: SpineUnit;
  readonly skill: SpineSkill;
  /** 0-based position in the whole course; "an earlier skill" means a lower index. */
  readonly index: number;
}

export function spineOrder(spine: Spine): readonly SpinePosition[] {
  const units = [...spine.units].sort((a, b) => a.order - b.order);
  const out: SpinePosition[] = [];
  for (const unit of units) {
    for (const skill of [...unit.skills].sort((a, b) => a.order - b.order)) {
      out.push({ unit, skill, index: out.length });
    }
  }
  return out;
}

export class SpineError extends Error {
  override readonly name = "SpineError";
}

/**
 * Structural rules the Effect schema cannot state: unique slugs, unique unit
 * order, and a theme for every skill. A spine that breaks one of these would
 * produce a curriculum with two units at the same place in the path.
 */
export function validateSpine(spine: Spine, themes: ThemeMap): readonly string[] {
  const problems: string[] = [];
  const unitSlugs = new Set<string>();
  const unitOrders = new Set<number>();
  for (const u of spine.units) {
    if (unitSlugs.has(u.slug)) problems.push(`duplicate unit slug ${u.slug}`);
    unitSlugs.add(u.slug);
    if (unitOrders.has(u.order)) problems.push(`two units share order ${u.order}`);
    unitOrders.add(u.order);
    const skillSlugs = new Set<string>();
    const skillOrders = new Set<number>();
    for (const s of u.skills) {
      if (skillSlugs.has(s.slug)) problems.push(`duplicate skill slug ${u.slug}/${s.slug}`);
      skillSlugs.add(s.slug);
      if (skillOrders.has(s.order)) problems.push(`two skills in ${u.slug} share order ${s.order}`);
      skillOrders.add(s.order);
      if (!(s.theme in themes.themes))
        problems.push(`skill ${u.slug}/${s.slug} names unknown theme ${s.theme}`);
      if (s.clickIdentifySets && s.kind !== "pronunciation")
        problems.push(`skill ${u.slug}/${s.slug} has clickIdentifySets but is not pronunciation`);
      const expected = `curriculum.units.${u.slug}.skills.${s.slug}.title`;
      if (s.titleKey !== expected)
        problems.push(`skill ${u.slug}/${s.slug} titleKey should be ${expected}`);
    }
    const expected = `curriculum.units.${u.slug}.title`;
    if (u.titleKey !== expected) problems.push(`unit ${u.slug} titleKey should be ${expected}`);
  }
  const used = new Set(spine.units.flatMap((u) => u.skills.map((s) => s.theme)));
  for (const name of Object.keys(themes.themes)) {
    if (!used.has(name)) problems.push(`theme ${name} is defined but no skill uses it`);
  }
  return problems;
}

export function parseSpine(raw: unknown): Spine {
  const decoded = decodeSpine(raw);
  if (Either.isLeft(decoded)) throw new SpineError(`spine.json: ${String(decoded.left)}`);
  return decoded.right;
}

export function parseThemes(raw: unknown): ThemeMap {
  const decoded = decodeThemes(raw);
  if (Either.isLeft(decoded)) throw new SpineError(`themes.json: ${String(decoded.left)}`);
  return decoded.right;
}
