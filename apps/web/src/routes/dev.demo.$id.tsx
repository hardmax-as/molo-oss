import { Link, createFileRoute, notFound } from "@tanstack/react-router";

import { demoById, type ViewDemoId } from "~/dev/catalog.ts";
import { DEV_STRINGS } from "~/dev/strings.ts";
import { DEMO_VIEWS } from "~/dev/views.tsx";

export const Route = createFileRoute("/dev/demo/$id")({ component: Demo });

/**
 * One demo, full page, with a way back. The view is the app's own component
 * with fabricated props; this route only puts the back link somewhere the
 * celebration's own full-screen sky cannot cover it.
 */
function Demo() {
  const { id } = Route.useParams();
  const entry = demoById(id);
  const view = entry && entry.href === undefined ? DEMO_VIEWS[entry.id as ViewDemoId] : undefined;
  if (!entry || !view) throw notFound();
  const { Component, overlay } = view;
  return (
    <section className="space-y-6" data-testid={`demo-view-${entry.id}`}>
      <div className={overlay === true ? "fixed left-4 top-4 z-[60]" : ""}>
        <Link
          to="/dev"
          className="inline-flex items-center rounded-2xl bg-cloud px-4 py-2 font-display font-semibold text-indigo shadow-card"
          data-testid="demo-back"
        >
          ← {DEV_STRINGS.back}
        </Link>
      </div>
      {overlay !== true && (
        <header>
          <h1 className="font-display text-2xl font-bold text-indigo">{entry.title}</h1>
          <p className="text-sm text-mist">{entry.note}</p>
        </header>
      )}
      <Component />
    </section>
  );
}
