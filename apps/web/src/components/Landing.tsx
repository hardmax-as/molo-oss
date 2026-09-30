import { Link } from "@tanstack/react-router";
import { ArrowRight, Ear, Sparkles, UserCheck, Volume2 } from "lucide-react";
import { motion } from "motion/react";

import { Landscape } from "~/components/illustrations/Landscape.tsx";
import { Penguin } from "~/components/illustrations/Penguin.tsx";
import { Sunbird } from "~/components/illustrations/Sunbird.tsx";
import { ButtonLink } from "~/components/ui/Button.tsx";
import { useT } from "~/lib/i18n.tsx";
import {
  heroBirds,
  heroItem,
  heroVariants,
  listVariants,
  riseVariants,
  useMotionPrefs,
  useWave,
} from "~/lib/motion.ts";

/** Published on /legal/company too (packages/brand/legal/company.*.md). */
const SUPPORT_EMAIL = "support@hellomolo.com";

/**
 * What a first visitor sees: why isiXhosa, how Molo teaches it, and one
 * way in. Facts are from Census 2022 and the published record; the copy
 * never contains isiXhosa beyond the greeting itself.
 */
export function Landing() {
  const t = useT();
  const { reduced } = useMotionPrefs();
  const rise = riseVariants(reduced);
  // The first wave waits for the birds to land at the end of the entrance.
  const greet = useWave({ greetAfterMs: 900 });
  const facts = ["speakers", "official", "clicks", "famous"] as const;
  const hows = [
    { key: "voices", Icon: Volume2, tone: "bg-sun text-indigo" },
    { key: "clicks", Icon: Ear, tone: "bg-sea text-white" },
    { key: "human", Icon: UserCheck, tone: "bg-indigo text-sun" },
    { key: "play", Icon: Sparkles, tone: "bg-coral text-white" },
  ] as const;
  return (
    <div className="-mx-4 -mt-6 sm:-mx-6">
      <section className="relative overflow-hidden rounded-b-[2.5rem] bg-sand-deep">
        <Landscape className="absolute inset-0 h-full w-full" />
        {/* One entrance for the hero, in order: the greeting, the promise,
            the way in, then the birds; the sunbird waves once they have
            landed. Focus or hover on the way in makes it wave again. */}
        <motion.div
          variants={heroVariants(reduced)}
          initial="hidden"
          animate="show"
          onFocus={greet.trigger}
          className="relative mx-auto flex max-w-5xl flex-col items-center gap-6 px-6 pb-16 pt-10 text-center sm:flex-row sm:text-left"
        >
          <div className="flex-1">
            <motion.h1
              variants={heroItem(reduced)}
              className="font-display text-6xl font-bold text-indigo sm:text-7xl"
            >
              {t("landing.hero.title")}
            </motion.h1>
            <motion.p variants={heroItem(reduced)} className="mt-3 max-w-lg text-xl text-ink">
              {t("landing.hero.body")}
            </motion.p>
            <motion.div
              variants={heroItem(reduced)}
              onPointerEnter={greet.trigger}
              className="mt-8 flex flex-wrap justify-center gap-3 sm:justify-start"
            >
              <ButtonLink to="/welcome" size="lg">
                {t("landing.hero.cta")}
                <ArrowRight size={20} aria-hidden />
              </ButtonLink>
              <ButtonLink to="/auth" variant="outline" size="lg">
                {t("auth.signIn")}
              </ButtonLink>
            </motion.div>
          </div>
          <motion.div variants={heroBirds(reduced)}>
            {/* The hero drawing is the page's one meaningful illustration: it is
                named once, as a whole, and the two SVGs inside stay hidden.
                Hover or tap on it and the sunbird waves back. */}
            <div
              className="flex items-end"
              role="img"
              aria-label={t("a11y.mascots")}
              onPointerEnter={greet.trigger}
              onPointerDown={greet.trigger}
            >
              <Sunbird pose="listen" size={200} wave={greet.wave} />
              <Penguin pose="hello" size={190} className="-ml-10" />
            </div>
          </motion.div>
        </motion.div>
      </section>

      <section className="mx-auto max-w-5xl px-6 py-12">
        <h2 className="font-display text-3xl font-bold text-indigo">{t("landing.why.title")}</h2>
        <p className="mt-1 text-mist">{t("landing.why.body")}</p>
        <motion.ul
          variants={listVariants}
          initial="hidden"
          whileInView="show"
          viewport={{ once: true, margin: "-40px" }}
          className="mt-6 grid gap-4 sm:grid-cols-2"
        >
          {facts.map((f) => (
            <motion.li
              key={f}
              variants={rise}
              className="lift rounded-3xl bg-cloud p-6 shadow-card"
            >
              <p className="font-display text-3xl font-bold text-sea-deep">
                {t(`landing.why.${f}.stat`)}
              </p>
              <p className="mt-1 font-display text-lg font-semibold text-indigo">
                {t(`landing.why.${f}.title`)}
              </p>
              <p className="mt-1 text-sm text-mist">{t(`landing.why.${f}.body`)}</p>
            </motion.li>
          ))}
        </motion.ul>
        <p className="mt-3 text-xs text-mist">{t("landing.why.source")}</p>
      </section>

      <section className="bg-indigo px-6 py-12 text-white">
        <div className="mx-auto max-w-5xl">
          <h2 className="font-display text-3xl font-bold">{t("landing.how.title")}</h2>
          <motion.ul
            variants={listVariants}
            initial="hidden"
            whileInView="show"
            viewport={{ once: true, margin: "-40px" }}
            className="mt-6 grid gap-4 sm:grid-cols-2"
          >
            {hows.map(({ key, Icon, tone }) => (
              <motion.li
                key={key}
                variants={rise}
                className="lift flex gap-4 rounded-3xl bg-white/5 p-5"
              >
                <span
                  className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl ${tone}`}
                >
                  <Icon size={24} aria-hidden />
                </span>
                <span>
                  <span className="block font-display text-lg font-semibold">
                    {t(`landing.how.${key}.title`)}
                  </span>
                  <span className="block text-sm text-white/75">
                    {t(`landing.how.${key}.body`)}
                  </span>
                </span>
              </motion.li>
            ))}
          </motion.ul>
        </div>
      </section>

      <section className="mx-auto flex max-w-5xl flex-col items-center gap-4 px-6 py-14 text-center">
        <div className="flex items-end">
          <Sunbird pose="cheer" size={130} />
          <Penguin pose="cheer" size={140} className="-ml-6" />
        </div>
        <h2 className="font-display text-3xl font-bold text-indigo">{t("landing.end.title")}</h2>
        <p className="max-w-md text-mist">{t("landing.end.body")}</p>
        <ButtonLink to="/welcome" size="lg">
          {t("landing.hero.cta")}
          <ArrowRight size={20} aria-hidden />
        </ButtonLink>
        <p className="mt-4 flex flex-wrap justify-center gap-4 text-xs text-mist">
          {/* The grammar reference is public; on a phone the header has no room
              for it before sign-in, so the landing page carries the way there. */}
          <Link to="/grammar" className="underline">
            {t("nav.grammar")}
          </Link>
          <Link to="/privacy" className="underline">
            {t("legal.privacy")}
          </Link>
          <Link to="/terms" className="underline">
            {t("legal.terms")}
          </Link>
          <Link to="/licences" className="underline">
            {t("legal.licences")}
          </Link>
          {/* App Store guideline 1.5: the support URL (this page) must show a
              way to reach us, so the address is here and not only on /legal/company. */}
          <a href={`mailto:${SUPPORT_EMAIL}`} className="underline">
            {t("legal.support")}: {SUPPORT_EMAIL}
          </a>
          <Link to="/legal/company" className="underline">
            {t("legal.contact")}
          </Link>
          <Link to="/edit" className="underline">
            {t("landing.end.editors")}
          </Link>
        </p>
      </section>
    </div>
  );
}
