import { useQueryClient } from "@tanstack/react-query";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { Library } from "lucide-react";
import { useEffect } from "react";
import { toast } from "sonner";

import { Landscape } from "~/components/illustrations/Landscape.tsx";
import { Sunbird } from "~/components/illustrations/Sunbird.tsx";
import { Landing } from "~/components/Landing.tsx";
import { MistakesLink } from "~/components/MistakesLink.tsx";
import { PathTrail } from "~/components/path/PathTrail.tsx";
import { ButtonLink } from "~/components/ui/Button.tsx";
import { Card } from "~/components/ui/Card.tsx";
import { HomeSkeleton } from "~/components/ui/Skeleton.tsx";
import { guestXp, readGuest } from "~/lib/guest.ts";
import { useT } from "~/lib/i18n.tsx";
import { useWave } from "~/lib/motion.ts";
import { useOnboarded } from "~/lib/onboarding.tsx";
import { useLearningPath } from "~/lib/path.ts";
import { preloadPath, usePrefetchNext } from "~/lib/prefetch.ts";
import { useMe } from "~/lib/session.tsx";

export const Route = createFileRoute("/")({
  // `?verified=1` is where the email-verification link lands; it is greeted once and dropped.
  validateSearch: (search: Record<string, unknown>): { verified?: 1 } =>
    search["verified"] === 1 || search["verified"] === "1" ? { verified: 1 } : {},
  // Hovering a link home starts the path, for a browser that will show it.
  loader: ({ context }) => preloadPath(context.queryClient),
  component: Home,
});

/**
 * Mounted beside the trail only, so the landing page still never asks for
 * the path: the unit that holds the next lesson, its first clips, and the
 * review session, fetched while the learner reads the path.
 */
function PrefetchNext({ signedIn }: { signedIn: boolean }) {
  const path = useLearningPath();
  usePrefetchNext(path.isPending ? null : path.rows, signedIn);
  return null;
}

/**
 * Home is the path: every published unit strung together as one continuous
 * route, so the learner scrolls from unit to unit rather than picking a
 * card off a grid (docs/DESIGN.md "The path").
 */
function Home() {
  const t = useT();
  const onboarded = useOnboarded();
  const me = useMe();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const { verified } = Route.useSearch();
  // A browser that finished the welcome flow will show the path whoever is
  // signed in, so it need not wait for /me before asking for it.
  useEffect(() => preloadPath(qc), [qc]);
  useEffect(() => {
    if (!verified) return;
    toast.success(t("auth.verified"));
    void navigate({ to: "/", search: {}, replace: true });
  }, [verified, navigate, t]);
  const guest = me.data ? null : readGuest();
  const greet = useWave();
  // First visit: the landing page says what this is; "Get started" leads to /welcome.
  // It is for visitors only: a signed-in learner always lands on their path,
  // even one who signed up without the intro (its "Sign in" would be a lie).
  if (onboarded === null) return <HomeSkeleton />;
  if (onboarded === false && !me.data) return <Landing />;
  return (
    <section>
      <div className="relative -mx-4 -mt-6 mb-8 h-40 overflow-hidden rounded-b-[2rem] sm:-mx-6 sm:h-48">
        <Landscape className="absolute inset-0 h-full w-full" />
        {/* The sunbird greets when the path appears and waves back on hover or tap. */}
        <div
          className="absolute bottom-0 right-6"
          onPointerEnter={greet.trigger}
          onPointerDown={greet.trigger}
        >
          <Sunbird pose="hello" size={120} wave={greet.wave} />
        </div>
      </div>
      <header className="mb-8 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-display text-4xl font-bold text-indigo">{t("units.title")}</h1>
          <p className="mt-1 text-mist">{t("app.tagline")}</p>
        </div>
        {/* A guest's phone header has no room for Grammar; the public
            reference stays one tap away here. Signed in, it is in the menu. */}
        {!me.data && (
          <ButtonLink to="/grammar" variant="outline" size="sm" className="min-h-11 sm:hidden">
            <Library size={16} aria-hidden /> {t("nav.grammar")}
          </ButtonLink>
        )}
      </header>
      {guest && guest.lessons.length > 0 && (
        <Card
          index={0}
          tone="sand"
          className="mb-6 flex flex-wrap items-center justify-between gap-3"
        >
          <span className="font-display font-semibold text-indigo">
            {t("guest.banner", { xp: guestXp(guest) })}
          </span>
          <ButtonLink to="/auth" search={{ mode: "signup" }} size="sm">
            {t("guest.create")}
          </ButtonLink>
        </Card>
      )}
      <MistakesLink className="mb-6" />
      {/* The trail loads the path itself, so the landing page never asks for it. */}
      <PathTrail />
      <PrefetchNext signedIn={!!me.data} />
    </section>
  );
}
