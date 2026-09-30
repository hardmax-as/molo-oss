import {
  celebrationExtras,
  guestCelebrationExtras,
  momentFor,
  newWordsFor,
  type CelebrationExtras,
  type MistakeEntry,
  type ProgressResponse,
} from "@molo/core";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { Lock } from "lucide-react";
import { useState } from "react";

import { LessonRunner } from "~/components/exercises/Runner.tsx";
import { LevelUp } from "~/components/LevelUp.tsx";
import { SaveProgressWall } from "~/components/SaveProgressWall.tsx";
import { ButtonLink } from "~/components/ui/Button.tsx";
import { Card } from "~/components/ui/Card.tsx";
import { completeLesson, getUnit, localToday, localTzOffset } from "~/lib/api.ts";
import {
  guestMustSignUp,
  guestSeenLexemes,
  guestTrickyLexemes,
  guestXp,
  readGuest,
  recordGuestLesson,
} from "~/lib/guest.ts";
import { useLang, useT } from "~/lib/i18n.tsx";
import { useUnitLocks } from "~/lib/locks.ts";
import { useMe } from "~/lib/session.tsx";

export const Route = createFileRoute("/learn/$slug/$lessonId")({ component: LessonPage });

function LessonPage() {
  const { slug, lessonId } = Route.useParams();
  const { lang } = useLang();
  const t = useT();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const unit = useQuery({ queryKey: ["unit", slug, lang], queryFn: () => getUnit(slug, lang) });
  // A level gained waits for the celebration sequence to finish: two
  // full-screen moments at once would be one too many.
  const [levelUp, setLevelUp] = useState<number | null>(null);
  const [showLevelUp, setShowLevelUp] = useState(false);
  // Streak, words learned and unit completion: the celebration sequence's
  // beats two to four. Null until the server answers (and for a guest,
  // whatever the device alone can prove).
  const [extras, setExtras] = useState<CelebrationExtras | null>(null);
  const back = () => navigate({ to: "/learn/$slug", params: { slug } });
  /**
   * Reports the lesson and folds the server's answer into the sequence. A
   * plain async call rather than a mutation: the learner may well skip the
   * sequence and leave this page while the request is still out, and the
   * cache must be updated either way.
   */
  const finish = async (summary: {
    correct: number;
    total: number;
    mistakes: readonly MistakeEntry[];
  }) => {
    const before = qc.getQueryData<ProgressResponse>(["progress"]);
    try {
      const r = await completeLesson(lessonId, {
        correct: summary.correct,
        total: summary.total,
        mistakes: summary.mistakes,
        today: localToday(),
        tzOffsetMinutes: localTzOffset(),
      });
      qc.setQueryData(["progress"], r.progress);
      // The beats the server knows about join the sequence, which is still
      // on its first one; the runner owns the screen until they are done.
      setExtras(celebrationExtras(r.celebration));
      if (before && r.progress.level > before.level) setLevelUp(r.progress.level);
      await Promise.all([
        qc.invalidateQueries({ queryKey: ["review-session"] }),
        qc.invalidateQueries({ queryKey: ["mistakes"] }),
        qc.invalidateQueries({ queryKey: ["crown", slug] }),
        qc.invalidateQueries({ queryKey: ["units"] }),
        // The unit carries this learner's history (badges, the words not
        // yet met), so the next lesson must not meet this one's words again.
        qc.invalidateQueries({ queryKey: ["unit", slug] }),
      ]);
    } catch {
      // Offline or refused: the lesson beat stands alone and the learner
      // still gets back to the path on the next tap.
    }
  };
  const me = useMe();
  const locks = useUnitLocks();
  const guest = me.data ? null : readGuest();
  if (unit.isPending || me.isPending) return <p className="text-mist">{t("common.loading")}</p>;
  // The free lesson is done and this is another one: an account keeps what was earned.
  if (guest && guestMustSignUp(guest, lessonId))
    return <SaveProgressWall xp={guestXp(guest)} lessons={guest.lessons.length} />;
  // The unit's prerequisite is unfinished. The server refuses the completion
  // too (403 unit_locked), so this is a kind explanation, not the guard.
  const lock = locks.lockOf(unit.data?.unit);
  if (lock.locked) {
    const prerequisite = lock.prerequisiteTitleKey
      ? t(lock.prerequisiteTitleKey as never) || (lock.prerequisiteSlug ?? "")
      : (lock.prerequisiteSlug ?? "");
    return (
      <Card className="mx-auto max-w-md text-center">
        <Lock size={32} className="mx-auto mb-3 text-mist" aria-hidden />
        <h2 className="font-display text-2xl font-bold text-indigo">{t("units.locked")}</h2>
        <p className="mt-2 text-mist">{t("units.lockedHint", { unit: prerequisite })}</p>
        {lock.prerequisiteSlug && (
          <ButtonLink
            to="/learn/$slug"
            params={{ slug: lock.prerequisiteSlug }}
            className="mt-6"
            variant="indigo"
          >
            {t("units.start")}
          </ButtonLink>
        )}
      </Card>
    );
  }
  // Out of hearts is the runner's to say, before the lesson and during it
  // alike: it pauses in place, under the header where the heart broke,
  // rather than unmounting a lesson halfway through.
  if (unit.isError || !unit.data) return <p className="text-coral-deep">{t("common.error")}</p>;
  const skill = unit.data.unit.skills.find((s) => s.lessons.some((l) => l.id === lessonId));
  const lesson = skill?.lessons.find((l) => l.id === lessonId);
  if (!lesson) return <p className="text-coral-deep">{t("common.error")}</p>;
  const unitTitleKey = unit.data.unit.titleKey;
  const unitLessonCount = unit.data.unit.lessonCount;
  // A signed-in learner gets "new word" / "tricky" from the server, which
  // knows their whole history. A guest has no history there, so the same
  // rule runs here over the lessons kept on the device.
  const seen = guest ? guestSeenLexemes(guest) : null;
  const tricky = guest ? guestTrickyLexemes(guest) : null;
  const exercises = lesson.exercises.map((e) => ({
    ...e,
    moment: seen && tricky ? momentFor({ teaches: e.teaches, seen, tricky }) : (e.moment ?? null),
  }));
  const taught = [...new Set(lesson.exercises.flatMap((e) => [...e.teaches]))];
  // The words met on a card before they are practised: the server's list for
  // an account, the same rule over the device's lessons for a guest.
  const newWords = newWordsFor({
    taught,
    serverUnseen: unit.data.unseenLexemeIds,
    guestSeen: seen,
  });
  return (
    <>
      <LessonRunner
        exercises={exercises}
        content={unit.data}
        newWords={newWords}
        grammarNotes={skill?.grammarNotes}
        exitTo={{ to: "/learn/$slug", params: { slug } }}
        heading={`${t(unit.data.unit.titleKey as never) || slug} — ${t("units.lesson", { order: lesson.order })}`}
        extras={extras}
        onLeave={() => {
          // A level gained still gets its own moment, after the sequence.
          if (levelUp === null) void back();
          else setShowLevelUp(true);
        }}
        onFinish={(summary) => {
          if (guest) {
            const next = recordGuestLesson(
              {
                lessonId,
                unitSlug: slug,
                correct: summary.correct,
                total: summary.total,
                xp: summary.xp,
                today: localToday(),
                teaches: taught,
              },
              summary.mistakes.map((m) => m.lexemeId),
            );
            // A guest has no account, so only what the device can prove.
            setExtras(
              guestCelebrationExtras({
                unit: {
                  slug,
                  titleKey: unitTitleKey,
                  lessonCount: unitLessonCount,
                },
                lessons: next.lessons.filter((l) => l.unitSlug === slug),
                firstTime: !guest.lessons.some((l) => l.lessonId === lessonId),
              }),
            );
            return;
          }
          void finish(summary);
        }}
      />
      <LevelUp level={showLevelUp ? levelUp : null} onClose={() => void back()} />
    </>
  );
}
