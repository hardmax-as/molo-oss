import type { ReviewSessionResponse } from "@molo/core";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { motion } from "motion/react";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";

import { MistakesLink } from "~/components/MistakesLink.tsx";
import { PracticeCard, type PracticeAction } from "~/components/PracticeCard.tsx";
import { ButtonLink } from "~/components/ui/Button.tsx";
import { Card } from "~/components/ui/Card.tsx";
import { RecallSkeleton } from "~/components/ui/Skeleton.tsx";
import { XpChip } from "~/components/ui/XpChip.tsx";
import { getReviewSession, localToday, localTzOffset, rateCard } from "~/lib/api.ts";
import { burst } from "~/lib/confetti.ts";
import { useLang, useT } from "~/lib/i18n.tsx";
import { useMotionPrefs } from "~/lib/motion.ts";
import { preloadReview } from "~/lib/prefetch.ts";
import { NOINDEX } from "~/lib/seo.ts";
import { useMe } from "~/lib/session.tsx";
import { useSfx } from "~/lib/sfx.tsx";

export const Route = createFileRoute("/review")({
  head: () => ({ meta: [NOINDEX] }),
  loader: ({ context }) => preloadReview(context.queryClient),
  component: ReviewPage,
});

type Card_ = ReviewSessionResponse["due"][number];

/**
 * The review session (ARCHITECTURE section 4): hear the word, recall the
 * gloss, reveal, rate. Cards flip in, ratings are the four pressable
 * buttons, and the session ends with a chime and the XP earned.
 */
function ReviewPage() {
  const t = useT();
  const { lang } = useLang();
  const { reduced } = useMotionPrefs();
  const sfx = useSfx();
  const me = useMe();
  const qc = useQueryClient();
  const session = useQuery({
    queryKey: ["review-session", lang],
    queryFn: () => getReviewSession(lang),
    enabled: !!me.data,
    staleTime: Infinity,
  });
  const [index, setIndex] = useState(0);
  const [revealed, setRevealed] = useState(false);
  const [sessionXp, setSessionXp] = useState(0);
  const finished = useRef(false);
  // A session is worked through once. Leaving after a rating drops it, so the
  // next visit (or the home page's prefetch) starts from the server rather
  // than from the cards already rated.
  const rated = useRef(false);
  useEffect(
    () => () => {
      if (rated.current) qc.removeQueries({ queryKey: ["review-session"] });
    },
    [qc],
  );
  const rate = useMutation({
    mutationFn: ({ cardId, rating }: { cardId: string; rating: 1 | 2 | 3 | 4 }) =>
      rateCard(cardId, { rating, today: localToday(), tzOffsetMinutes: localTzOffset() }),
    onSuccess: async (r, vars) => {
      rated.current = true;
      sfx.play(vars.rating === 1 ? "wrong" : "correct");
      setSessionXp((x) => x + r.xp);
      setIndex((i) => i + 1);
      setRevealed(false);
      qc.setQueryData(["progress"], r.progress);
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : t("common.error")),
  });

  const queue: Card_[] = session.data ? [...session.data.due, ...session.data.fresh] : [];
  const card = queue[index];
  useEffect(() => {
    if (session.data && !card && queue.length > 0 && !finished.current) {
      finished.current = true;
      sfx.play("lesson_complete");
      void burst(reduced);
    }
  }, [session.data, card, queue.length, sfx, reduced]);

  // The account guard comes before the session's pending state: for a guest
  // the session query is disabled, and a disabled query stays pending for
  // ever, which left a signed-out learner on "Loading" (W05).
  if (me.isPending) return <RecallSkeleton />;
  if (!me.data)
    return (
      <Card className="mx-auto max-w-md text-center" data-testid="review-sign-in">
        <p className="mb-4 text-mist">{t("review.signInFirst")}</p>
        <ButtonLink to="/auth" variant="indigo">
          {t("nav.signIn")}
        </ButtonLink>
      </Card>
    );
  if (session.isPending) return <RecallSkeleton />;
  if (session.isError || !session.data)
    return <p className="text-coral-deep">{t("common.error")}</p>;

  if (!card) {
    return (
      <div className="mx-auto max-w-md">
        <Card tone="indigo" className="p-8 text-center">
          <h1 className="font-display text-3xl font-bold">
            {queue.length === 0 ? t("review.title") : t("review.done")}
          </h1>
          <p className="mt-2 text-white/80">{queue.length === 0 ? t("review.nothingDue") : null}</p>
          {queue.length > 0 && (
            <div className="my-6 flex justify-center">
              <XpChip value={sessionXp} delta size="xl" />
            </div>
          )}
          <ButtonLink to="/" className="mt-4">
            {t("nav.learn")}
          </ButtonLink>
        </Card>
        <MistakesLink className="mt-6" />
      </div>
    );
  }
  const lx = session.data.lexemes[card.lexemeId];
  const buttons: PracticeAction[] = [
    { key: 1, label: t("review.again"), variant: "coral" },
    { key: 2, label: t("review.hard"), variant: "primary" },
    { key: 3, label: t("review.good"), variant: "sea" },
    { key: 4, label: t("review.easy"), variant: "indigo" },
  ];

  return (
    <section className="mx-auto max-w-2xl">
      <div className="mb-4 flex items-center justify-between text-sm text-mist">
        <span className="font-semibold text-indigo">
          {t("review.title")} · {t("lesson.progress", { done: index + 1, total: queue.length })}
        </span>
        <span className="inline-flex items-center gap-3">
          <span>{t("review.due", { count: session.data.dueTotal })}</span>
          <XpChip value={sessionXp} size="sm" duration={0.4} />
        </span>
      </div>
      {/* The heading above already reads "Review · 3 of 10"; the bar is its picture. */}
      <div className="mb-4 h-3 overflow-hidden rounded-full bg-sand-deep" aria-hidden>
        <motion.div
          className="h-full bg-sea"
          animate={{ width: `${(index / queue.length) * 100}%` }}
          transition={{ duration: reduced ? 0 : 0.4 }}
        />
      </div>
      <PracticeCard
        id={card.cardId}
        lexeme={lx}
        badge={card.state}
        revealed={revealed}
        onReveal={() => setRevealed(true)}
        disabled={rate.isPending}
        actions={buttons}
        onAnswer={(key) => rate.mutate({ cardId: card.cardId, rating: key as 1 | 2 | 3 | 4 })}
      />
      <MistakesLink className="mt-6" />
    </section>
  );
}
