import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { motion } from "motion/react";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";

import { Penguin } from "~/components/illustrations/Penguin.tsx";
import { PracticeCard, type PracticeAction } from "~/components/PracticeCard.tsx";
import { SaveProgressWall } from "~/components/SaveProgressWall.tsx";
import { ButtonLink } from "~/components/ui/Button.tsx";
import { Card } from "~/components/ui/Card.tsx";
import { RecallSkeleton } from "~/components/ui/Skeleton.tsx";
import { XpChip } from "~/components/ui/XpChip.tsx";
import { getMistakes, localToday, localTzOffset, practiseMistake } from "~/lib/api.ts";
import { burst } from "~/lib/confetti.ts";
import { guestXp, readGuest } from "~/lib/guest.ts";
import { useLang, useT } from "~/lib/i18n.tsx";
import { useMotionPrefs } from "~/lib/motion.ts";
import { preloadMistakes } from "~/lib/prefetch.ts";
import { NOINDEX } from "~/lib/seo.ts";
import { useMe } from "~/lib/session.tsx";
import { useSfx } from "~/lib/sfx.tsx";

export const Route = createFileRoute("/mistakes")({
  head: () => ({ meta: [NOINDEX] }),
  loader: ({ context }) => preloadMistakes(context.queryClient),
  component: MistakesPage,
});

/**
 * "Practise mistakes": the same recall card as the review session, over the
 * words this learner answered wrong in a lesson. A right answer clears the
 * word; a wrong one keeps it, with its counter one higher. Remediation, so
 * it never costs a heart.
 */
function MistakesPage() {
  const t = useT();
  const { lang } = useLang();
  const { reduced } = useMotionPrefs();
  const sfx = useSfx();
  const me = useMe();
  const qc = useQueryClient();
  const mistakes = useQuery({
    queryKey: ["mistakes", lang],
    queryFn: () => getMistakes(lang),
    enabled: !!me.data,
    staleTime: Infinity,
  });
  const [index, setIndex] = useState(0);
  const [revealed, setRevealed] = useState(false);
  const [sessionXp, setSessionXp] = useState(0);
  const [clearedCount, setClearedCount] = useState(0);
  const celebrated = useRef(false);
  // Words answered here leave the list on the server. Once the page is left,
  // the mistakes link and the next session read it again instead of
  // replaying this one from memory.
  const answered = useRef(false);
  useEffect(
    () => () => {
      if (answered.current) void qc.invalidateQueries({ queryKey: ["mistakes"] });
    },
    [qc],
  );

  const answer = useMutation({
    mutationFn: (vars: { lexemeId: string; exerciseType: string; correct: boolean }) =>
      practiseMistake({
        lexemeId: vars.lexemeId,
        exerciseType: vars.exerciseType as never,
        correct: vars.correct,
        today: localToday(),
        tzOffsetMinutes: localTzOffset(),
      }),
    onSuccess: (r, vars) => {
      answered.current = true;
      sfx.play(vars.correct ? "correct" : "wrong");
      setSessionXp((x) => x + r.xp);
      if (r.cleared) setClearedCount((n) => n + 1);
      setIndex((i) => i + 1);
      setRevealed(false);
      qc.setQueryData(["progress"], r.progress);
      void qc.invalidateQueries({ queryKey: ["review-session"] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : t("common.error")),
  });

  const queue = mistakes.data?.mistakes ?? [];
  const current = queue[index];
  useEffect(() => {
    if (mistakes.data && !current && queue.length > 0 && !celebrated.current) {
      celebrated.current = true;
      sfx.play("lesson_complete");
      void burst(reduced);
    }
  }, [mistakes.data, current, queue.length, sfx, reduced]);

  if (me.isPending) return <RecallSkeleton answers={2} />;
  if (!me.data) {
    // A guest has no server-side mistakes; anyone with a lesson behind them
    // sees the same account wall as the second lesson.
    const guest = readGuest();
    if (guest.lessons.length > 0)
      return <SaveProgressWall xp={guestXp(guest)} lessons={guest.lessons.length} />;
    return (
      <Card className="mx-auto max-w-md text-center">
        <p className="mb-4 text-mist">{t("mistakes.signInFirst")}</p>
        <ButtonLink to="/auth" variant="indigo">
          {t("nav.signIn")}
        </ButtonLink>
      </Card>
    );
  }
  if (mistakes.isPending) return <RecallSkeleton answers={2} />;
  if (mistakes.isError || !mistakes.data)
    return <p className="text-coral-deep">{t("common.error")}</p>;

  if (!current) {
    const practised = queue.length > 0;
    return (
      <Card tone={practised ? "indigo" : "sand"} className="mx-auto max-w-md p-8 text-center">
        {!practised && (
          <div className="mb-2 flex justify-center">
            <Penguin pose="cheer" size={120} />
          </div>
        )}
        <h1
          className={`font-display text-3xl font-bold ${practised ? "" : "text-indigo"}`}
          data-testid="mistakes-done"
        >
          {practised ? t("mistakes.sessionDone") : t("mistakes.none")}
        </h1>
        {practised && (
          <>
            <p className="mt-2 text-white/80">
              {t("mistakes.cleared")}: {clearedCount}
            </p>
            <div className="my-6 flex justify-center">
              <XpChip value={sessionXp} delta size="xl" />
            </div>
          </>
        )}
        <ButtonLink to="/" className="mt-4">
          {practised ? t("nav.learn") : t("mistakes.noneCta")}
        </ButtonLink>
      </Card>
    );
  }

  const actions: PracticeAction[] = [
    { key: "wrong", label: t("mistakes.stillLearning"), variant: "coral" },
    { key: "right", label: t("mistakes.knewIt"), variant: "sea" },
  ];

  return (
    <section className="mx-auto max-w-2xl">
      <div className="mb-4 flex items-center justify-between text-sm text-mist">
        <span className="font-semibold text-indigo">
          {t("mistakes.title")} · {t("lesson.progress", { done: index + 1, total: queue.length })}
        </span>
        <span className="inline-flex items-center gap-3">
          <span>{t("mistakes.open", { count: mistakes.data.count })}</span>
          <XpChip value={sessionXp} size="sm" duration={0.4} />
        </span>
      </div>
      <p className="mb-4 text-sm text-mist">{t("mistakes.subtitle")}</p>
      <div className="mb-4 h-3 overflow-hidden rounded-full bg-sand-deep" aria-hidden>
        <motion.div
          className="h-full bg-coral"
          animate={{ width: `${(index / queue.length) * 100}%` }}
          transition={{ duration: reduced ? 0 : 0.4 }}
        />
      </div>
      <PracticeCard
        id={current.lexemeId}
        lexeme={current.lexeme}
        badge={t("mistakes.timesWrong", { count: current.timesWrong })}
        revealed={revealed}
        onReveal={() => setRevealed(true)}
        disabled={answer.isPending}
        actions={actions}
        onAnswer={(key) =>
          answer.mutate({
            lexemeId: current.lexemeId,
            exerciseType: current.exerciseType,
            correct: key === "right",
          })
        }
      />
    </section>
  );
}
