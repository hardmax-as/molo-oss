import type { LessonBeat, MilestoneBeat, StreakBeat, UnitBeat } from "@molo/core";
import type { TranslationKey } from "@molo/i18n";
import { motion } from "motion/react";

import { Crane } from "~/components/illustrations/Crane.tsx";
import { Penguin } from "~/components/illustrations/Penguin.tsx";
import { Sunbird } from "~/components/illustrations/Sunbird.tsx";
import { StreakFlame } from "~/components/ui/StreakFlame.tsx";
import { useT } from "~/lib/i18n.tsx";

import { Crown, Medal, Rays, Sparkles } from "./art.tsx";
import { CountUp } from "./CountUp.tsx";

/**
 * The four end-of-lesson beats (docs/DESIGN.md "After a lesson"). Each one
 * owns its entrance and its mascot: the penguin is the learner who just did
 * the work, the sunbird is the daily greeting that keeps the streak going,
 * and the crane is the mentor who hands over a medal. The unit finale shows
 * the three of them together.
 */

const WEEKDAY_KEYS = [
  "celebration.weekday.mon",
  "celebration.weekday.tue",
  "celebration.weekday.wed",
  "celebration.weekday.thu",
  "celebration.weekday.fri",
  "celebration.weekday.sat",
  "celebration.weekday.sun",
] as const satisfies readonly TranslationKey[];

function Title({ children, reduced }: { children: React.ReactNode; reduced: boolean }) {
  return (
    <motion.h2
      initial={reduced ? { opacity: 0 } : { opacity: 0, y: 14 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: reduced ? 0.15 : 0.3, ease: [0.22, 1, 0.36, 1] }}
      className="font-display text-sm font-semibold uppercase tracking-[0.2em] text-sun"
    >
      {children}
    </motion.h2>
  );
}

function Body({ children, reduced }: { children: React.ReactNode; reduced: boolean }) {
  return (
    <motion.p
      initial={reduced ? { opacity: 0 } : { opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: reduced ? 0.15 : 0.3, delay: reduced ? 0 : 0.28 }}
      className="mx-auto max-w-sm text-balance text-white/80"
    >
      {children}
    </motion.p>
  );
}

export function LessonComplete({ beat, reduced }: { beat: LessonBeat; reduced: boolean }) {
  const t = useT();
  return (
    <div className="text-center" data-testid="celebration-lesson">
      <div className="mb-2 flex justify-center">
        <Penguin pose={beat.perfect ? "cheer" : "hello"} size={132} surface="dark" />
      </div>
      <Title reduced={reduced}>
        {beat.perfect ? t("celebration.lesson.perfect") : t("celebration.lesson.title")}
      </Title>
      <div className="relative my-6 flex h-40 items-center justify-center">
        <Rays reduced={reduced} />
        <Sparkles reduced={reduced} />
        <p className="relative font-display text-[5.5rem] font-bold leading-none text-sun drop-shadow-[0_6px_0_rgba(217,119,43,0.45)]">
          <CountUp value={beat.xp} reduced={reduced} />
          <span className="ml-2 align-middle text-3xl text-sun/70">{t("gamification.xp")}</span>
        </p>
      </div>
      <Body reduced={reduced}>
        {t("celebration.lesson.accuracy", {
          correct: beat.correct,
          total: beat.total,
          percent: beat.accuracy,
        })}
      </Body>
    </div>
  );
}

function WeekStrip({ beat, reduced }: { beat: StreakBeat; reduced: boolean }) {
  const t = useT();
  return (
    <div
      className="mx-auto mt-7 flex max-w-xs justify-between gap-1 rounded-3xl bg-white/10 px-4 py-3"
      role="img"
      aria-label={t("celebration.a11y.week")}
    >
      {WEEKDAY_KEYS.map((key, i) => {
        const filled = beat.week[i] === true;
        const today = i === beat.todayIndex;
        return (
          <span key={key} className="flex w-8 flex-col items-center gap-1.5">
            <span className="font-display text-[11px] font-semibold uppercase text-white/60">
              {t(key)}
            </span>
            <motion.span
              initial={reduced ? false : { scale: 0.4, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              transition={{
                delay: reduced ? 0 : 0.3 + i * 0.05,
                type: "spring",
                stiffness: 420,
                damping: 18,
              }}
              className={`flex h-7 w-7 items-center justify-center rounded-full text-xs font-bold ${
                filled ? "bg-sun text-indigo" : "bg-white/10 text-white/40"
              } ${today ? "ring-2 ring-cloud ring-offset-2 ring-offset-indigo-deep" : ""}`}
            >
              {filled ? "✓" : ""}
            </motion.span>
          </span>
        );
      })}
    </div>
  );
}

export function StreakExtended({ beat, reduced }: { beat: StreakBeat; reduced: boolean }) {
  const t = useT();
  return (
    <div className="text-center" data-testid="celebration-streak">
      <div className="mb-2 flex justify-center">
        <Sunbird pose="cheer" size={120} surface="dark" />
      </div>
      <Title reduced={reduced}>
        {beat.frozen ? t("celebration.streak.titleFrozen") : t("celebration.streak.title")}
      </Title>
      <div className="relative my-5 flex items-center justify-center gap-3">
        <Rays reduced={reduced} />
        <motion.span
          initial={reduced ? false : { scale: 0.3, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ type: "spring", stiffness: 240, damping: 12, delay: reduced ? 0 : 0.1 }}
          className="relative"
        >
          <StreakFlame days={beat.days} size={72} showCount={false} />
        </motion.span>
        <p className="relative font-display text-[4.5rem] font-bold leading-none text-sun">
          <CountUp value={beat.days} reduced={reduced} duration={0.7} />
        </p>
      </div>
      <p className="font-display text-lg font-semibold text-white">
        {t("celebration.streak.dayLabel", { count: beat.days })}
      </p>
      <div className="mt-3">
        <Body reduced={reduced}>
          {beat.frozen ? t("celebration.streak.bodyFrozen") : t("celebration.streak.body")}
        </Body>
      </div>
      <WeekStrip beat={beat} reduced={reduced} />
    </div>
  );
}

export function Milestone({ beat, reduced }: { beat: MilestoneBeat; reduced: boolean }) {
  const t = useT();
  return (
    <div className="text-center" data-testid="celebration-milestone">
      <div className="mb-1 flex justify-center">
        <Crane pose="hello" size={116} surface="dark" />
      </div>
      <Title reduced={reduced}>{t("celebration.milestone.subtitle")}</Title>
      <div className="relative my-4 flex h-48 items-center justify-center">
        <Rays reduced={reduced} />
        <Sparkles reduced={reduced} />
        <motion.div
          initial={reduced ? { opacity: 0 } : { scale: 0.3, opacity: 0, rotate: -12 }}
          animate={{ scale: 1, opacity: 1, rotate: 0 }}
          transition={
            reduced
              ? { duration: 0.15 }
              : { type: "spring", stiffness: 220, damping: 13, delay: 0.1 }
          }
          className="relative"
        >
          <Medal
            words={beat.threshold}
            label={t("celebration.a11y.medal", { words: beat.threshold })}
          />
        </motion.div>
      </div>
      <p className="font-display text-2xl font-bold text-white">
        {t("celebration.milestone.title", { words: beat.words })}
      </p>
      <div className="mt-3">
        <Body reduced={reduced}>{t("celebration.milestone.body")}</Body>
      </div>
    </div>
  );
}

export function UnitFinished({ beat, reduced }: { beat: UnitBeat; reduced: boolean }) {
  const t = useT();
  const title = t(beat.titleKey as TranslationKey) || beat.slug;
  return (
    <div className="text-center" data-testid="celebration-unit">
      <div className="relative flex h-44 items-center justify-center">
        <Rays reduced={reduced} tone={beat.flawless ? "sun" : "sea"} />
        <div className="relative">
          <Crown flawless={beat.flawless} label={t("celebration.a11y.crown")} reduced={reduced} />
        </div>
      </div>
      <Title reduced={reduced}>
        {beat.flawless ? t("celebration.unit.titleFlawless") : t("celebration.unit.title")}
      </Title>
      <p className="mt-2 font-display text-3xl font-bold text-white">{title}</p>
      <div className="mt-3">
        <Body reduced={reduced}>
          {beat.flawless
            ? t("celebration.unit.bodyFlawless", { unit: title })
            : t("celebration.unit.body", { unit: title })}
        </Body>
      </div>
      {/* The trio takes a bow: the learner, the voice and the mentor. */}
      <div className="mt-5 flex items-end justify-center gap-1">
        <Sunbird pose="cheer" size={76} surface="dark" />
        <Penguin pose="cheer" size={104} surface="dark" />
        <Crane pose="cheer" size={86} surface="dark" />
      </div>
    </div>
  );
}
