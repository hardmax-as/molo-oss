import { Link, createFileRoute } from "@tanstack/react-router";

import { groupedDemos } from "~/dev/catalog.ts";
import { DEV_STRINGS } from "~/dev/strings.ts";

export const Route = createFileRoute("/dev/")({ component: Gallery });

const card =
  "block rounded-2xl bg-cloud p-4 shadow-card transition hover:-translate-y-0.5 hover:shadow-pop";

/**
 * The developer gallery (docs/DESIGN.md "Developer gallery"). Every screen
 * and every celebration, opened directly instead of played towards — nobody
 * should have to keep a streak alive for a week to look at the screen that
 * congratulates them for it.
 *
 * Gated by `/dev`'s layout route, and every label on it is developer-only
 * English from `~/dev/strings.ts`. Nothing here writes to the database or
 * calls a paid API.
 */
function Gallery() {
  return (
    <section className="space-y-8" data-testid="dev-gallery">
      <header className="space-y-2">
        <h1 className="font-display text-3xl font-bold text-indigo">{DEV_STRINGS.title}</h1>
        <p className="max-w-2xl text-mist">{DEV_STRINGS.intro}</p>
      </header>

      <section className="space-y-3">
        <h2 className="text-xs font-bold uppercase tracking-widest text-mist">
          {DEV_STRINGS.otherPages}
        </h2>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <Link to="/dev/knobs" className={card} data-testid="dev-knobs-link">
            <p className="font-display font-semibold text-indigo">{DEV_STRINGS.knobs.title}</p>
            <p className="text-xs text-mist">{DEV_STRINGS.knobs.hint}</p>
          </Link>
          <Link to="/dev/playground" className={card}>
            <p className="font-display font-semibold text-indigo">{DEV_STRINGS.playground}</p>
            <p className="text-xs text-mist">{DEV_STRINGS.playgroundHint}</p>
          </Link>
          <Link to="/dev/mascots" className={card}>
            <p className="font-display font-semibold text-indigo">{DEV_STRINGS.mascots}</p>
            <p className="text-xs text-mist">{DEV_STRINGS.mascotsHint}</p>
          </Link>
        </div>
      </section>

      {groupedDemos().map((group) => (
        <section key={group.group} className="space-y-3" data-testid={`dev-group-${group.group}`}>
          <h2 className="text-xs font-bold uppercase tracking-widest text-mist">{group.title}</h2>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {group.demos.map((demo) =>
              demo.href === undefined ? (
                <Link
                  key={demo.id}
                  to="/dev/demo/$id"
                  params={{ id: demo.id }}
                  className={card}
                  data-testid={`demo-${demo.id}`}
                >
                  <p className="font-display font-semibold text-indigo">{demo.title}</p>
                  <p className="text-xs text-mist">{demo.note}</p>
                </Link>
              ) : (
                // The real page is the honest demo of itself.
                <a key={demo.id} href={demo.href} className={card} data-testid={`demo-${demo.id}`}>
                  <p className="font-display font-semibold text-indigo">{demo.title}</p>
                  <p className="text-xs text-mist">
                    {demo.note} · {DEV_STRINGS.opensRealScreen}
                  </p>
                </a>
              ),
            )}
          </div>
        </section>
      ))}
    </section>
  );
}
