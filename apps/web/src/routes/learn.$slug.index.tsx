import { useQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { Crown } from "lucide-react";
import { useEffect, useRef } from "react";

import { PathTrail } from "~/components/path/PathTrail.tsx";
import { ProgressRing } from "~/components/ui/ProgressRing.tsx";
import { UnitPageSkeleton } from "~/components/ui/Skeleton.tsx";
import { getCrown } from "~/lib/api.ts";
import { useT } from "~/lib/i18n.tsx";
import { useLearningPath } from "~/lib/path.ts";
import { preloadUnitPage, usePrefetchUnit } from "~/lib/prefetch.ts";
import { useMe } from "~/lib/session.tsx";
import { useSfx } from "~/lib/sfx.tsx";

export const Route = createFileRoute("/learn/$slug/")({
  // Hovering a link here starts the path and, signed in, the crown.
  loader: ({ context, params }) => preloadUnitPage(context.queryClient, params.slug),
  component: UnitPage,
});

/**
 * One unit's stretch of the path. The same trail the home page draws,
 * narrowed to this unit: the sticky section header is the unit's own name,
 * so it carries the `h1` here, and the crown ring rides above it.
 */
function UnitPage() {
  const { slug } = Route.useParams();
  const t = useT();
  const sfx = useSfx();
  const me = useMe();
  const path = useLearningPath(slug);
  // Every lesson on this page opens from the unit payload: fetched now, so
  // the lesson page draws at once, with the next lesson's first clips.
  usePrefetchUnit(slug, path.isPending || path.isError || !path.found ? null : path.rows);
  const crown = useQuery({
    queryKey: ["crown", slug],
    queryFn: () => getCrown(slug),
    enabled: !!me.data,
  });
  const celebrated = useRef(false);
  useEffect(() => {
    if (crown.data?.crowned && !celebrated.current) {
      celebrated.current = true;
      sfx.play("crown");
    }
  }, [crown.data?.crowned, sfx]);

  if (path.isPending) return <UnitPageSkeleton />;
  // A slug with no published unit behind it — a draft, a retired unit, a
  // typo — is an error, not an empty course. The learner asked for a
  // specific thing and it is not there.
  if (path.isError || !path.found) return <p className="text-coral-deep">{t("common.error")}</p>;
  const crowned = crown.data?.crowned === true;
  const mastery = crown.data && crown.data.total > 0 ? crown.data.mature / crown.data.total : 0;

  return (
    <section>
      {crown.data && crown.data.total > 0 && (
        <div
          className={`relative mb-4 flex items-center gap-3 overflow-hidden rounded-3xl p-5 text-white shadow-pop ${
            crowned ? "bg-gradient-to-br from-indigo via-indigo-soft to-ochre" : "bg-indigo"
          }`}
        >
          {crowned && (
            <span className="shimmer-gold pointer-events-none absolute inset-0" aria-hidden />
          )}
          <ProgressRing
            value={mastery}
            size={52}
            stroke={6}
            tone={crowned ? "sun" : "sea"}
            track="rgb(255 255 255 / 0.15)"
          >
            {crowned ? (
              <Crown size={22} className="text-sun" aria-hidden />
            ) : (
              <span className="text-xs font-bold">{Math.round(mastery * 100)}</span>
            )}
          </ProgressRing>
          <p className={crowned ? "font-display text-lg font-semibold text-sun" : "text-white/80"}>
            {crowned
              ? t("units.crowned")
              : t("units.crown", { mature: crown.data.mature, total: crown.data.total })}
          </p>
        </div>
      )}
      <PathTrail slug={slug} headingLevel="h1" />
    </section>
  );
}
