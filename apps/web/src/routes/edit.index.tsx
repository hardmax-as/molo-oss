import type { ContentNote, GateBlockerCount, SkillSentenceGap, UnitRecordingGap } from "@molo/core";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, createFileRoute, type LinkProps } from "@tanstack/react-router";
import { RefreshCw } from "lucide-react";
import type { ReactNode } from "react";

import { getContentNotes, getEditorOverview } from "~/lib/api.ts";
import { blockerDestination, type Destination } from "~/lib/editor-queue.ts";
import { useT } from "~/lib/i18n.tsx";

export const Route = createFileRoute("/edit/")({ component: EditorQueue });

const card = "rounded-2xl border border-sand-deep bg-white p-4 shadow-card";
const rowLink =
  "flex items-baseline gap-3 rounded-xl px-3 py-2 -mx-1 hover:bg-sand focus-visible:bg-sand";

/**
 * The editor landing page (ARCHITECTURE section 7, EDITOR-GUIDE "What needs
 * doing"): the first screen of `/edit`, and a work queue rather than a
 * dashboard. Every figure names rows an editor can act on, and clicking it
 * opens the filtered view holding exactly those rows — the filters on the
 * grid, the sentence list and the studio all live in the URL for that
 * reason.
 *
 * One request. `GET /edit/overview` is the same `contentReport` the Monday
 * Slack post is built from, so a number here and a number in the channel
 * cannot disagree, and the page opens fast enough to open every morning.
 */
function EditorQueue() {
  const t = useT();
  const qc = useQueryClient();
  const overview = useQuery({
    queryKey: ["editor-overview"],
    queryFn: getEditorOverview,
    staleTime: 60_000,
  });

  if (overview.isPending) return <p className="text-mist">{t("common.loading")}</p>;
  if (overview.isError || !overview.data)
    return <p className="rounded-2xl bg-cloud p-4 text-ink">{t("common.error")}</p>;

  const r = overview.data;
  const w = r.writing;
  const rec = r.recording;

  return (
    <section className="space-y-6" data-testid="editor-queue">
      <header className="space-y-2">
        <h1 className="font-display text-3xl font-bold text-indigo">{t("edit.overview.title")}</h1>
        <p className="max-w-2xl text-mist">{t("edit.overview.intro")}</p>
        <p className="flex items-center gap-3 text-xs text-mist">
          <span>{t("edit.overview.asOf", { date: r.date })}</span>
          <button
            type="button"
            className="inline-flex items-center gap-1 rounded-full border border-mist-soft px-2 py-1 font-semibold text-indigo hover:bg-sand"
            onClick={() => void qc.invalidateQueries({ queryKey: ["editor-overview"] })}
          >
            <RefreshCw size={12} aria-hidden /> {t("edit.overview.refresh")}
          </button>
        </p>
      </header>

      <div className="grid gap-4 lg:grid-cols-2">
        {/* ---- to write ------------------------------------------------- */}
        <section className={card} aria-labelledby="queue-write" data-testid="queue-write">
          <h2 id="queue-write" className="font-display text-xl font-bold text-indigo">
            {t("edit.overview.write.title")}
          </h2>
          <p className="mb-2 text-xs text-mist">{t("edit.overview.write.hint")}</p>

          <SkillGaps skills={w.skillsWithoutSentences} total={w.skillsWithoutSentencesTotal} />

          <ul className="mt-1 space-y-0.5">
            <Figure
              n={w.lexemesMissingNbGloss}
              label={t("edit.overview.write.missingNb")}
              to={{ to: "/edit/content", search: { status: "pending", missingGloss: "nb" } }}
              testId="gap-missing-nb"
            />
            <Figure
              n={w.lexemesMissingEnGloss}
              label={t("edit.overview.write.missingEn")}
              to={{ to: "/edit/content", search: { status: "pending", missingGloss: "en" } }}
            />
            <Figure
              n={w.lexemesMissingBothGlosses}
              label={t("edit.overview.write.missingBoth")}
              to={{ to: "/edit/content", search: { status: "pending", missingGloss: "all" } }}
            />
            <Figure
              n={w.exercisesReferencingUnpublished}
              label={t("edit.overview.write.exercisesUnpublished")}
              to={{ to: "/edit/curriculum" }}
            />
            <Figure
              n={w.sentencesMissingTranslation}
              label={t("edit.overview.write.sentencesUntranslated")}
              to={{ to: "/edit/sentences", search: { status: "pending", missingGloss: "any" } }}
            />
          </ul>
        </section>

        {/* ---- to record ------------------------------------------------ */}
        <section className={card} aria-labelledby="queue-record" data-testid="queue-record">
          <h2 id="queue-record" className="font-display text-xl font-bold text-indigo">
            {t("edit.overview.record.title")}
          </h2>
          <p className="mb-2 text-xs text-mist">{t("edit.overview.record.hint")}</p>

          <UnitGaps units={rec.byUnit} />

          <ul className="mt-1 space-y-0.5">
            <Figure
              n={rec.notInAnyUnit}
              label={t("edit.overview.record.notInAnyUnit")}
              to={{ to: "/edit/studio" }}
            />
            <Figure
              n={rec.takesAwaitingApproval}
              label={t("edit.overview.record.takes")}
              to={{ to: "/edit/review" }}
            />
            <Figure
              n={rec.speakersWithConsent}
              label={t("edit.overview.record.speakers")}
              to={{ to: "/edit/studio" }}
              // A session cannot start without one, so zero is the one
              // figure on this page that is bad news when it is small.
              alwaysShow
              tone={rec.speakersWithConsent === 0 ? "warn" : "plain"}
              testId="gap-speakers"
            />
          </ul>
          {rec.speakersWithConsent === 0 && (
            <p className="mt-2 rounded-xl bg-coral/10 px-3 py-2 text-sm text-coral-deep">
              {t("edit.overview.record.speakersNone")}
            </p>
          )}
        </section>
      </div>

      <SpeakerNotes />

      {/* ---- blocked from publishing ------------------------------------ */}
      <BlockedFromPublishing
        gate={r.blockers.gate}
        considered={r.blockers.gateConsidered}
        reviewQueue={r.blockers.reviewQueue}
      />
    </section>
  );
}

/**
 * One figure and what it means, as a link to the rows behind it. Zero is
 * not work, so it is left off the page entirely rather than shown greyed:
 * a queue of noughts is a dashboard.
 */
function Figure({
  n,
  label,
  to,
  tone = "plain",
  alwaysShow = false,
  testId,
}: {
  n: number;
  label: ReactNode;
  to: Destination;
  tone?: "plain" | "warn";
  alwaysShow?: boolean;
  testId?: string;
}) {
  if (n === 0 && !alwaysShow) return null;
  return (
    <li>
      {/* The union above is narrower than `LinkProps`, which is generic over
          every route in the tree; the cast hands it back its own shape. */}
      <Link {...(to as LinkProps)} className={rowLink} data-testid={testId}>
        <span
          className={`min-w-10 font-display text-2xl font-bold tabular-nums ${tone === "warn" ? "text-coral-deep" : "text-sea-deep"}`}
        >
          {n}
        </span>
        <span className="text-sm text-ink">{label}</span>
      </Link>
    </li>
  );
}

/** Skills whose lessons hold no sentence at all, named, with their unit. */
function SkillGaps({ skills, total }: { skills: readonly SkillSentenceGap[]; total: number }) {
  const t = useT();
  if (total === 0) return null;
  return (
    <div className="mb-3" data-testid="gap-skills">
      <h3 className="text-xs font-bold uppercase tracking-widest text-mist">
        {t("edit.overview.write.skills")} · {total}
      </h3>
      <ul className="mt-1 space-y-0.5">
        {skills.map((s) => (
          <li key={s.skillId}>
            <Link
              to="/edit/curriculum"
              hash={s.skillId}
              className="block rounded-xl px-3 py-1.5 -mx-1 hover:bg-sand focus-visible:bg-sand"
            >
              <span className="text-sm font-semibold text-ink">
                {t(s.skillTitleKey as never) || s.skillSlug}
              </span>{" "}
              <span className="text-xs text-mist">
                {t(s.unitTitleKey as never) || s.unitSlug} ·{" "}
                {s.lessons === 0
                  ? t("edit.overview.write.skillLessonsNone")
                  : t("edit.overview.write.skillLessons", { count: s.lessons })}
              </span>
            </Link>
          </li>
        ))}
        {total > skills.length && (
          <li className="px-3 text-xs text-mist">
            {t("edit.overview.write.skillsMore", { count: total - skills.length })}
          </li>
        )}
      </ul>
    </div>
  );
}

/** Words with no native recording, per unit, so a session is one unit long. */
function UnitGaps({ units }: { units: readonly UnitRecordingGap[] }) {
  const t = useT();
  if (units.length === 0) return null;
  return (
    <div className="mb-3" data-testid="gap-units">
      <h3 className="text-xs font-bold uppercase tracking-widest text-mist">
        {t("edit.overview.record.byUnit")}
      </h3>
      <ul className="mt-1 space-y-0.5">
        {units.map((u) => (
          <li key={u.unitSlug}>
            <Link
              to="/edit/studio"
              search={{ unit: u.unitSlug }}
              className={rowLink}
              data-testid={`gap-unit-${u.unitSlug}`}
            >
              <span className="min-w-10 font-display text-2xl font-bold tabular-nums text-sea-deep">
                {u.missing}
              </span>
              <span className="text-sm text-ink">
                {t(u.unitTitleKey as never) || u.unitSlug}{" "}
                <span className="text-xs text-mist">
                  {t("edit.overview.record.unitMissing", { count: u.missing })}
                </span>
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}

/**
 * The publish gate's own refusals, aggregated: "34 words need a recording,
 * 12 need a Norwegian gloss, 8 sit in a class xh-morph cannot inflect" —
 * rather than one row at a time in the bulk-action panel.
 */
function BlockedFromPublishing({
  gate,
  considered,
  reviewQueue,
}: {
  gate: readonly GateBlockerCount[];
  considered: { readonly lexemes: number; readonly sentences: number };
  reviewQueue: number;
}) {
  const t = useT();
  return (
    <section className={card} aria-labelledby="queue-blocked" data-testid="queue-blocked">
      <h2 id="queue-blocked" className="font-display text-xl font-bold text-indigo">
        {t("edit.overview.blocked.title")}
      </h2>
      <p className="mb-2 text-xs text-mist">
        {t("edit.overview.blocked.hint", {
          lexemes: considered.lexemes,
          sentences: considered.sentences,
        })}
      </p>
      {gate.length === 0 ? (
        <p className="text-sm text-mist">{t("edit.overview.blocked.none")}</p>
      ) : (
        <ul className="grid gap-0.5 sm:grid-cols-2">
          {gate.map((g) => (
            <Figure
              key={`${g.kind}:${g.code}:${g.detail ?? ""}`}
              n={g.rows}
              testId={`blocker-${g.kind}-${g.code}${g.detail ? `-${g.detail}` : ""}`}
              label={
                <>
                  {t(`edit.overview.blocked.${g.kind === "lexeme" ? "words" : "sentences"}`)}{" "}
                  {t(`edit.overview.blocked.reason.${g.code}`, { lang: g.detail ?? "" })}
                </>
              }
              to={blockerDestination(g)}
            />
          ))}
        </ul>
      )}
      {reviewQueue > 0 && (
        <ul className="mt-2 border-t border-sand-deep pt-2">
          <Figure
            n={reviewQueue}
            label={t("edit.reviewQueue")}
            to={{ to: "/edit/review" }}
            testId="blocker-review-queue"
          />
        </ul>
      )}
    </section>
  );
}

/** A word or sentence opens its page; a bare click has none, so it opens in the studio. */
function NoteLink({ note, children }: { note: ContentNote; children: ReactNode }) {
  if (note.kind === "click")
    return (
      <Link to="/edit/studio" search={{ kind: "click", item: note.id }} className={rowLink}>
        {children}
      </Link>
    );
  return (
    <Link
      to={note.kind === "lexeme" ? "/edit/lexemes/$id" : "/edit/sentences/$id"}
      params={{ id: note.id }}
      className={rowLink}
    >
      {children}
    </Link>
  );
}

/**
 * What speakers and editors have said about words, sentences and clicks,
 * newest first: mostly what a speaker found in the studio. A note changes nothing
 * by itself; each one links to the page where the fix is made.
 */
function SpeakerNotes() {
  const t = useT();
  const notes = useQuery({ queryKey: ["content-notes"], queryFn: () => getContentNotes(20) });
  const list = notes.data?.notes ?? [];
  if (notes.isPending || list.length === 0) return null;
  return (
    <section className={card} aria-labelledby="queue-notes" data-testid="queue-notes">
      <h2 id="queue-notes" className="font-display text-xl font-bold text-indigo">
        {t("edit.overview.notes.title")}
      </h2>
      <p className="mb-2 text-xs text-mist">{t("edit.overview.notes.hint")}</p>
      <ul className="space-y-1">
        {list.map((n) => (
          <li key={`${n.id}:${n.at}`}>
            <NoteLink note={n}>
              <span className="shrink-0 font-semibold text-indigo" lang="xh">
                {n.text}
              </span>
              <span className="min-w-0 flex-1 text-ink [overflow-wrap:anywhere]">{n.note}</span>
              <span className="shrink-0 text-xs text-mist">
                {t("edit.overview.notes.by", {
                  name: n.authorName ?? "?",
                  date: n.at.slice(0, 10),
                })}
              </span>
            </NoteLink>
          </li>
        ))}
      </ul>
    </section>
  );
}
