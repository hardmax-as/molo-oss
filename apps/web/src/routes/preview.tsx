import { createFileRoute } from "@tanstack/react-router";

import { EditorPreview } from "~/components/EditorPreview.tsx";
import { NOINDEX } from "~/lib/seo.ts";

export const Route = createFileRoute("/preview")({
  head: () => ({ meta: [NOINDEX] }),
  component: EditorPreview,
});
