import { ArrowRight } from "lucide-react";

import { Penguin } from "~/components/illustrations/Penguin.tsx";
import { ButtonLink } from "~/components/ui/Button.tsx";
import { XpChip } from "~/components/ui/XpChip.tsx";
import { useFocusOnMount } from "~/lib/focus.ts";
import { useT } from "~/lib/i18n.tsx";

/**
 * The account wall: a guest has finished the free lesson and has something
 * to lose. Sign-up or sign-in keeps the XP; nothing is taken away.
 *
 * It replaces the lesson the learner asked for, so the heading takes focus:
 * a keyboard or screen-reader user would otherwise be left on a page that
 * silently changed under them (WCAG 3.2.2). Focus is *not* trapped — this is
 * a page, not an overlay, and the header behind it stays usable.
 */
export function SaveProgressWall({ xp, lessons }: { xp: number; lessons: number }) {
  const t = useT();
  const heading = useFocusOnMount<HTMLHeadingElement>();
  return (
    <section
      className="mx-auto max-w-lg rounded-3xl bg-cloud p-8 text-center shadow-card"
      aria-labelledby="wall-title"
    >
      <div className="mb-2 flex justify-center">
        <Penguin pose="cheer" size={130} />
      </div>
      <div className="mb-3 flex justify-center">
        <XpChip value={xp} size="xl" />
      </div>
      <h1
        id="wall-title"
        ref={heading}
        tabIndex={-1}
        className="font-display text-2xl font-bold text-indigo"
      >
        {t("guest.wallTitle")}
      </h1>
      <p className="mt-1 text-mist">{t("guest.wallBody", { count: lessons })}</p>
      <div className="mt-6 flex flex-col gap-3">
        <ButtonLink to="/auth" search={{ mode: "signup" }} size="lg">
          {t("guest.create")}
          <ArrowRight size={20} aria-hidden />
        </ButtonLink>
        <ButtonLink to="/auth" variant="outline">
          {t("guest.haveAccount")}
        </ButtonLink>
      </div>
      <p className="mt-4 text-xs text-mist">{t("guest.keep")}</p>
    </section>
  );
}
