import { Outlet, createFileRoute } from "@tanstack/react-router";
import { useEffect } from "react";

import { useDevAccess } from "~/dev/access.ts";
import { armKnobs } from "~/dev/knobs.tsx";
import { DEV_STRINGS } from "~/dev/strings.ts";
import { useT } from "~/lib/i18n.tsx";
import { NOINDEX } from "~/lib/seo.ts";

export const Route = createFileRoute("/dev")({
  head: () => ({ meta: [NOINDEX] }),
  component: DevLayout,
});

/**
 * The gate on every `/dev/*` page, the editor dashboard's shape with the
 * development build added: `useDevAccess()` is the only question asked, and
 * it answers "admins only" in a production bundle. A learner sees the same
 * plain refusal here as they would on `/edit`, and there is no second door —
 * `/dev/playground` and `/dev/mascots` are children of this route.
 */
function DevLayout() {
  const t = useT();
  const { allowed, pending } = useDevAccess();
  // The same gate arms the knobs store, in both directions. That is the
  // only place the flag is ever written, so on a production bundle an
  // override can only apply to an account this gate has called `admin` —
  // and stops applying the moment it stops saying so.
  useEffect(() => {
    if (!pending) armKnobs(allowed);
  }, [allowed, pending]);
  if (pending) return <p className="text-mist">{t("common.loading")}</p>;
  if (!allowed)
    return (
      <p className="rounded-3xl bg-cloud p-6 text-ink shadow-card" data-testid="dev-denied">
        {DEV_STRINGS.denied}
      </p>
    );
  return <Outlet />;
}
