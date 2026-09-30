import { createFileRoute, redirect } from "@tanstack/react-router";

/** The batch recorder grew into the studio; old links keep working. */
export const Route = createFileRoute("/edit/recorder")({
  beforeLoad: () => {
    throw redirect({ to: "/edit/studio" });
  },
});
