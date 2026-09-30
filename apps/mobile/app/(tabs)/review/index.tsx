import type { ReviewSessionResponse } from "@molo/core";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "expo-router";
import { useEffect, useRef, useState } from "react";
import { Text, View } from "react-native";
import Animated, { FadeIn, FlipInEasyX } from "react-native-reanimated";

import { MistakesCard } from "~/components/MistakesCard.tsx";
import { RecallCard, type RecallAction } from "~/components/RecallCard.tsx";
import { SaveProgressWall } from "~/components/SaveProgressWall.tsx";
import { useAnnounce } from "~/lib/announce.ts";
import { ApiError, getReviewSession, localToday, localTzOffset, rateCard } from "~/lib/api.ts";
import { useLang, useT } from "~/lib/i18n.tsx";
import { flushPendingReviews, pendingReviewsSettled, queueReview } from "~/lib/offline.ts";
import { useMe } from "~/lib/session.tsx";
import { useGuest } from "~/lib/use-guest.tsx";
import { Button } from "~/ui/Button.tsx";
import { Card } from "~/ui/Card.tsx";
import { Confetti } from "~/ui/Confetti.tsx";
import { haptic } from "~/ui/haptics.ts";
import { Penguin } from "~/ui/Mascots.tsx";
import { useMotion } from "~/ui/motion.ts";
import { Screen } from "~/ui/Screen.tsx";
import { useSfx } from "~/ui/sfx.tsx";
import { RecallSkeleton } from "~/ui/Skeleton.tsx";
import { XpChip } from "~/ui/XpChip.tsx";

type Card_ = ReviewSessionResponse["due"][number];
type Rating = 1 | 2 | 3 | 4;

/**
 * The review session (ARCHITECTURE section 4): due cards first, then new
 * ones. Hear the word, recall, reveal, rate. Ratings that fail on the
 * network are queued and replayed next time.
 */
export default function ReviewScreen() {
  const t = useT();
  const { lang } = useLang();
  const me = useMe();
  const guest = useGuest();
  const qc = useQueryClient();
  const router = useRouter();
  const sfx = useSfx();
  const m = useMotion();
  // Known empty already (the home screen flushed before it prefetched the
  // session): nothing to wait for, so a prefetched session shows at once.
  const [flushed, setFlushed] = useState(pendingReviewsSettled);
  useEffect(() => {
    flushPendingReviews().finally(() => setFlushed(true));
  }, []);
  const session = useQuery({
    queryKey: ["review-session", lang],
    queryFn: () => getReviewSession(lang),
    enabled: !!me.data && flushed,
    staleTime: Infinity,
  });
  const [index, setIndex] = useState(0);
  const [revealed, setRevealed] = useState(false);
  const [sessionXp, setSessionXp] = useState(0);
  const [queued, setQueued] = useState(0);
  const [burst, setBurst] = useState(0);
  const [heartPop, setHeartPop] = useState(0);
  // A session is worked through once. Should this screen ever unmount after a
  // rating, the next one starts from the server, not from the cards already
  // rated (the home screen prefetches a fresh one).
  const rated = useRef(false);
  useEffect(
    () => () => {
      if (rated.current) qc.removeQueries({ queryKey: ["review-session"] });
    },
    [qc],
  );
  // The heart pop-up is a live region, which only Android reads.
  useAnnounce(heartPop > 0 ? t("hearts.earned") : null);
  useEffect(() => {
    if (heartPop === 0) return;
    const id = setTimeout(() => setHeartPop(0), 1800);
    return () => clearTimeout(id);
  }, [heartPop]);
  // Session finished with XP: one burst and one chime, from an effect (never during render).
  useEffect(() => {
    const total = session.data ? session.data.due.length + session.data.fresh.length : 0;
    if (session.data && index >= total && sessionXp > 0 && burst === 0) {
      setBurst(1);
      sfx.play("lesson_complete");
    }
  }, [session.data, index, sessionXp, burst, sfx]);

  const rate = useMutation({
    mutationFn: async ({ cardId, rating }: { cardId: string; rating: Rating }) => {
      try {
        return await rateCard(cardId, {
          rating,
          today: localToday(),
          tzOffsetMinutes: localTzOffset(),
        });
      } catch (e) {
        if (e instanceof ApiError) throw e;
        await queueReview({ cardId, rating, today: localToday() });
        setQueued((n) => n + 1);
        return null;
      }
    },
    onSuccess: (r, vars) => {
      rated.current = true;
      if (r) {
        setSessionXp((x) => x + r.xp);
        qc.setQueryData(["progress"], r.progress);
        if (r.hearts) qc.setQueryData(["hearts"], r.hearts);
        if (r.heartEarned) {
          // Practice gave a heart back: a chime and a small pop over the card.
          setHeartPop((n) => n + 1);
          void haptic.success();
        }
      }
      sfx.play(vars.rating === 1 ? "wrong" : "correct");
      void (vars.rating === 1 ? haptic.warning() : haptic.light());
      setIndex((i) => i + 1);
      setRevealed(false);
    },
  });

  if (me.isPending || (me.data && (session.isPending || !flushed))) return <RecallSkeleton />;
  if (!me.data) {
    // A guest with a lesson behind them: the wall, with the XP they would keep.
    if (guest.walled)
      return (
        <Screen>
          <SaveProgressWall xp={guest.xp} lessons={guest.lessons} />
        </Screen>
      );
    return (
      <Screen>
        <Card tone="indigo">
          <View className="flex-row items-center gap-3">
            <Text className="flex-1 font-display text-lg text-cloud">
              {t("review.signInFirst")}
            </Text>
            <Penguin pose="listen" size={96} surface="dark" />
          </View>
          <View className="mt-4 items-start">
            <Button label={t("nav.signIn")} variant="sun" onPress={() => router.push("/auth")} />
          </View>
        </Card>
      </Screen>
    );
  }
  if (session.isError || !session.data)
    return (
      <Screen>
        <Text className="font-body-semibold text-coral-deep">{t("common.error")}</Text>
      </Screen>
    );

  const queue: Card_[] = [...session.data.due, ...session.data.fresh];
  const card = queue[index];

  if (!card) {
    const done = queue.length > 0;
    return (
      <Screen>
        <Confetti burst={burst} count={24} />
        <Animated.View
          entering={m.reduced ? FadeIn : FlipInEasyX.duration(500)}
          className={`items-center rounded-4xl p-8 ${done ? "bg-indigo" : "bg-cloud"}`}
        >
          <Penguin pose={done ? "cheer" : "think"} size={130} />
          <Text
            className={`mt-2 text-center font-display text-2xl ${done ? "text-cloud" : "text-indigo"}`}
          >
            {done ? t("review.sessionDone") : t("review.nothingDue")}
          </Text>
          {done && (
            <View className="my-4">
              <XpChip xp={sessionXp} size="xl" />
            </View>
          )}
          {queued > 0 && (
            <Text className="mb-3 font-body text-sm text-cloud/80">{t("review.queued")}</Text>
          )}
          <View className={done ? "" : "mt-5"}>
            <Button
              label={done ? t("nav.learn") : t("review.emptyCta")}
              variant="sun"
              size="lg"
              onPress={() => router.navigate("/")}
            />
          </View>
        </Animated.View>
        <MistakesCard />
      </Screen>
    );
  }

  const lx = session.data.lexemes[card.lexemeId];
  const buttons: RecallAction[] = [
    { key: 1, label: t("review.again"), variant: "coral", testID: "rate-1" },
    { key: 2, label: t("review.hard"), variant: "sun", testID: "rate-2" },
    { key: 3, label: t("review.good"), variant: "sea", testID: "rate-3" },
    { key: 4, label: t("review.easy"), variant: "indigo", testID: "rate-4" },
  ];

  return (
    <Screen>
      {heartPop > 0 && (
        <Animated.View
          key={heartPop}
          entering={m.reduced ? FadeIn : FlipInEasyX.duration(400)}
          className="self-center rounded-full bg-coral-deep px-4 py-1"
          accessibilityLiveRegion="polite"
          testID="heart-earned"
        >
          <Text className="font-display text-base text-cloud">♥ {t("hearts.earned")}</Text>
        </Animated.View>
      )}
      <View className="flex-row items-center justify-between gap-3">
        <Text className="font-body-semibold text-sm text-mist">
          {t("lesson.progress", { done: index + 1, total: queue.length })}
        </Text>
        <Text className="flex-1 text-center font-body-semibold text-sm text-mist" numberOfLines={1}>
          {t("review.due", { count: session.data.dueTotal })} ·{" "}
          {t("review.newCards", { count: session.data.fresh.length })}
        </Text>
        <XpChip xp={sessionXp} />
      </View>
      <RecallCard
        id={card.cardId}
        lexeme={lx}
        revealed={revealed}
        onReveal={() => setRevealed(true)}
        disabled={rate.isPending}
        actions={buttons}
        onAnswer={(key) => rate.mutate({ cardId: card.cardId, rating: key as Rating })}
      />
      <MistakesCard />
    </Screen>
  );
}
