import { useQuery } from "@tanstack/react-query";
import { Link, createFileRoute, useNavigate } from "@tanstack/react-router";
import { ArrowLeft, ArrowRight, Sparkles } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { useState } from "react";

import { AudioButton } from "~/components/AudioButton.tsx";
import { Penguin } from "~/components/illustrations/Penguin.tsx";
import { Sunbird } from "~/components/illustrations/Sunbird.tsx";
import { Button } from "~/components/ui/Button.tsx";
import { getWelcome } from "~/lib/api.ts";
import { useLang, useT } from "~/lib/i18n.tsx";
import { easeOut, useMotionPrefs } from "~/lib/motion.ts";
import { useFinishOnboarding, type OnboardingChoices } from "~/lib/onboarding.tsx";
import { useMe } from "~/lib/session.tsx";
import { useSfx } from "~/lib/sfx.tsx";

export const Route = createFileRoute("/welcome")({ component: Welcome });

const STEPS = ["hello", "language", "goal", "where", "clicks", "ready"] as const;
type Step = (typeof STEPS)[number];

const GOALS = [
  { key: "casual", xp: 20, min: 3 },
  { key: "regular", xp: 50, min: 8 },
  { key: "serious", xp: 100, min: 15 },
] as const;

/** The three basic clicks with the DESIGN.md colours; descriptions come from i18n, never isiXhosa words. */
const BASIC_CLICKS = ["c", "x", "q"] as const;
const CLICK_TONES: Record<string, string> = {
  c: "bg-sea-deep text-white border-sea-edge",
  x: "bg-sun text-indigo border-sun-deep",
  q: "bg-coral-deep text-white border-coral-edge",
};

/**
 * First-run flow: six short, skippable steps. Value first (hear a real
 * greeting), then the choices that change the lesson (language, goal,
 * listening and speaking), a taste of the clicks, and the first lesson.
 * Sign-up is offered, never required.
 */
function Welcome() {
  const t = useT();
  const { lang, setLang } = useLang();
  const { reduced } = useMotionPrefs();
  const sfx = useSfx();
  const me = useMe();
  const navigate = useNavigate();
  const finish = useFinishOnboarding();
  const welcome = useQuery({ queryKey: ["welcome"], queryFn: getWelcome });
  const [step, setStep] = useState(0);
  const [dir, setDir] = useState(1);
  const [choices, setChoices] = useState<OnboardingChoices>({
    sourceLang: lang,
    dailyGoalXp: 50,
    listening: true,
    speaking: true,
  });
  const [openClick, setOpenClick] = useState<string | null>(null);
  const current: Step = STEPS[step] ?? "hello";
  const last = step === STEPS.length - 1;

  const go = (delta: number) => {
    setDir(delta);
    setStep((s) => Math.max(0, Math.min(STEPS.length - 1, s + delta)));
    sfx.play("tap");
  };
  const done = async (to: "home" | "auth" | "unit") => {
    await finish(choices);
    if (to === "auth") await navigate({ to: "/auth" });
    else if (to === "unit" && welcome.data?.firstUnitSlug)
      await navigate({ to: "/learn/$slug", params: { slug: welcome.data.firstUnitSlug } });
    else await navigate({ to: "/" });
  };
  const skip = async () => {
    await finish(null);
    await navigate({ to: "/" });
  };

  const slide = {
    initial: reduced ? { opacity: 0 } : { opacity: 0, x: 48 * dir },
    animate: { opacity: 1, x: 0 },
    exit: reduced ? { opacity: 0 } : { opacity: 0, x: -48 * dir },
    transition: { duration: reduced ? 0.12 : 0.26, ease: easeOut },
  };

  return (
    <section className="mx-auto max-w-xl">
      <div className="mb-4 flex items-center justify-between">
        {/* Dots are the picture of progress; the words are for everyone else. */}
        <p className="sr-only" role="status" aria-live="polite">
          {t("onboarding.step", { n: step + 1, total: STEPS.length })}
        </p>
        <ol className="flex items-center gap-2" aria-hidden>
          {STEPS.map((s, i) => (
            <li key={s}>
              <motion.span
                className={`block h-2.5 rounded-full ${i <= step ? "bg-sun" : "bg-sand-deep"}`}
                animate={{ width: i === step ? 28 : 10 }}
                transition={{ duration: reduced ? 0 : 0.25, ease: easeOut }}
              />
            </li>
          ))}
        </ol>
        {!last && (
          <Button variant="ghost" size="sm" onClick={() => void skip()}>
            {t("onboarding.skip")}
          </Button>
        )}
      </div>

      <div className="overflow-hidden rounded-3xl bg-cloud p-6 shadow-card sm:p-10">
        <AnimatePresence mode="wait" initial={false}>
          <motion.div key={current} {...slide}>
            {current === "hello" && (
              <div className="text-center">
                <div className="mb-2 flex justify-center">
                  <Sunbird pose="hello" size={130} />
                </div>
                <motion.h1
                  className="font-display text-7xl font-bold text-indigo"
                  initial={reduced ? false : { scale: 0.6, rotate: -6 }}
                  animate={{ scale: 1, rotate: 0 }}
                  transition={{ type: "spring", stiffness: 300, damping: 18 }}
                >
                  {t("onboarding.hello.title")}
                </motion.h1>
                {welcome.data?.greeting && (
                  <div className="mt-4 flex flex-col items-center gap-2">
                    <AudioButton
                      url={welcome.data.greeting.audio?.url}
                      label={t("onboarding.hello.listen")}
                      attribution={welcome.data.greeting.audio?.attribution}
                      size="lg"
                      tone="sun"
                    />
                    {welcome.data.greeting.gloss && (
                      <p className="text-mist">
                        {welcome.data.greeting.lemma} · {welcome.data.greeting.gloss}
                      </p>
                    )}
                  </div>
                )}
                <p className="mx-auto mt-6 max-w-md text-lg text-ink">
                  {t("onboarding.hello.body")}
                </p>
              </div>
            )}

            {current === "language" && (
              <div>
                <h1 className="font-display text-3xl font-bold text-indigo">
                  {t("onboarding.language.title")}
                </h1>
                <p className="mt-1 text-mist">{t("onboarding.language.body")}</p>
                <div className="mt-6 grid gap-3 sm:grid-cols-2">
                  {(
                    [
                      ["en", "🇬🇧", "English"],
                      ["nb", "🇳🇴", "Norsk"],
                    ] as const
                  ).map(([code, flag, name]) => (
                    <button
                      key={code}
                      type="button"
                      aria-pressed={choices.sourceLang === code}
                      onClick={() => {
                        setChoices((c) => ({ ...c, sourceLang: code }));
                        setLang(code);
                        sfx.play("tap");
                      }}
                      className={`pressable flex items-center gap-4 rounded-2xl border-b-[3px] p-5 text-left font-display text-2xl font-semibold ${choices.sourceLang === code ? "bg-indigo text-white border-indigo-deep" : "bg-sand text-indigo border-sand-deep"}`}
                    >
                      <span aria-hidden className="text-3xl">
                        {flag}
                      </span>
                      {name}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {current === "goal" && (
              <div>
                <h1 className="font-display text-3xl font-bold text-indigo">
                  {t("onboarding.goal.title")}
                </h1>
                <div className="mt-6 grid gap-3">
                  {GOALS.map((g) => (
                    <button
                      key={g.key}
                      type="button"
                      aria-pressed={choices.dailyGoalXp === g.xp}
                      onClick={() => {
                        setChoices((c) => ({ ...c, dailyGoalXp: g.xp }));
                        sfx.play("tap");
                      }}
                      className={`pressable flex items-center justify-between rounded-2xl border-b-[3px] p-5 text-left ${choices.dailyGoalXp === g.xp ? "bg-sun text-indigo border-sun-deep" : "bg-sand text-indigo border-sand-deep"}`}
                    >
                      <span className="font-display text-xl font-semibold">
                        {t(`onboarding.goal.${g.key}`)}
                      </span>
                      <span className="text-right text-sm">
                        <span className="block font-semibold">
                          {t("onboarding.goal.perDay", { xp: g.xp })}
                        </span>
                        <span className="text-mist">
                          {t("onboarding.goal.minutes", { min: g.min })}
                        </span>
                      </span>
                    </button>
                  ))}
                </div>
              </div>
            )}

            {current === "where" && (
              <div>
                <h1 className="font-display text-3xl font-bold text-indigo">
                  {t("onboarding.where.title")}
                </h1>
                <p className="mt-1 text-mist">{t("onboarding.where.body")}</p>
                <div className="mt-6 space-y-3">
                  {(
                    [
                      [
                        "listening",
                        t("settings.listening"),
                        choices.listening,
                        (v: boolean) => setChoices((c) => ({ ...c, listening: v })),
                      ],
                      [
                        "speaking",
                        t("settings.speaking"),
                        choices.speaking,
                        (v: boolean) => setChoices((c) => ({ ...c, speaking: v })),
                      ],
                      [
                        "sound",
                        t("onboarding.where.sound"),
                        sfx.enabled,
                        (v: boolean) => sfx.setEnabled(v),
                      ],
                    ] as const
                  ).map(([key, label, on, set]) => (
                    // A <label> cannot label a <button>; the switch names itself.
                    <div
                      key={key}
                      className="flex items-center justify-between rounded-2xl bg-sand p-4"
                    >
                      <span className="font-display text-lg font-semibold text-indigo" aria-hidden>
                        {label}
                      </span>
                      <button
                        type="button"
                        role="switch"
                        aria-checked={on}
                        aria-label={label}
                        onClick={() => set(!on)}
                        className={`relative h-8 w-14 rounded-full transition-colors ${on ? "bg-sea" : "bg-mist-soft"}`}
                      >
                        <motion.span
                          className="absolute top-1 h-6 w-6 rounded-full bg-white shadow"
                          animate={{ left: on ? 28 : 4 }}
                          transition={{ duration: reduced ? 0 : 0.18 }}
                        />
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {current === "clicks" && (
              <div>
                <h1 className="font-display text-3xl font-bold text-indigo">
                  {t("onboarding.clicks.title")}
                </h1>
                <p className="mt-1 text-mist">{t("onboarding.clicks.body")}</p>
                <div className="mt-6 flex justify-center gap-4">
                  {BASIC_CLICKS.map((c) => (
                    <motion.button
                      key={c}
                      type="button"
                      aria-pressed={openClick === c}
                      aria-label={t("onboarding.clicks.label", { click: c })}
                      onClick={() => {
                        setOpenClick(c);
                        sfx.play("cue");
                      }}
                      whileTap={reduced ? {} : { scale: 0.92 }}
                      animate={openClick === c && !reduced ? { scale: [1, 1.15, 1] } : { scale: 1 }}
                      className={`pressable flex h-24 w-24 items-center justify-center rounded-full border-b-4 font-display text-5xl font-bold shadow-card ${CLICK_TONES[c] ?? ""}`}
                    >
                      {c}
                    </motion.button>
                  ))}
                </div>
                <div className="mt-6 min-h-16 text-center" role="status" aria-live="polite">
                  <AnimatePresence mode="wait">
                    <motion.p
                      key={openClick ?? "hint"}
                      initial={{ opacity: 0, y: 8 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -8 }}
                      transition={{ duration: reduced ? 0 : 0.2 }}
                      className={openClick ? "text-lg text-ink" : "text-mist"}
                    >
                      {openClick
                        ? t(`onboarding.clicks.${openClick}` as "onboarding.clicks.c")
                        : t("onboarding.clicks.tapHint")}
                    </motion.p>
                  </AnimatePresence>
                </div>
              </div>
            )}

            {current === "ready" && (
              <div className="text-center">
                <div className="mb-2 flex justify-center">
                  <Penguin pose="cheer" size={130} />
                </div>
                <Sparkles className="mx-auto text-sun" size={40} aria-hidden />
                <h1 className="mt-3 font-display text-3xl font-bold text-indigo">
                  {t("onboarding.ready.title")}
                </h1>
                <p className="mt-1 text-mist">{t("onboarding.ready.body")}</p>
                <p className="mt-2 text-xs text-mist">
                  {t("legal.accept")}{" "}
                  <Link to="/terms" className="underline">
                    {t("legal.terms")}
                  </Link>{" "}
                  {t("legal.and")}{" "}
                  <Link to="/privacy" className="underline">
                    {t("legal.privacy")}
                  </Link>
                </p>
                <div className="mt-8 flex flex-col gap-3">
                  <Button size="lg" onClick={() => void done("unit")}>
                    {welcome.data?.firstUnitSlug
                      ? t("onboarding.ready.start")
                      : t("onboarding.ready.browse")}
                    <ArrowRight size={20} aria-hidden />
                  </Button>
                  {!me.data && (
                    <>
                      <Button variant="indigo" onClick={() => void done("auth")}>
                        {t("onboarding.ready.account")}
                      </Button>
                      <Button variant="ghost" onClick={() => void done("home")}>
                        {t("onboarding.ready.guest")}
                      </Button>
                    </>
                  )}
                </div>
              </div>
            )}
          </motion.div>
        </AnimatePresence>

        {!last && (
          <div className="mt-8 flex items-center justify-between">
            <Button variant="ghost" onClick={() => go(-1)} disabled={step === 0}>
              <ArrowLeft size={18} aria-hidden />
              {t("onboarding.back")}
            </Button>
            <Button onClick={() => go(1)}>
              {t("onboarding.next")}
              <ArrowRight size={18} aria-hidden />
            </Button>
          </div>
        )}
      </div>
    </section>
  );
}
