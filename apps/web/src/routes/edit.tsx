import { Link, Outlet, createFileRoute } from "@tanstack/react-router";

import { Button, ButtonLink } from "~/components/ui/Button.tsx";
import { Card } from "~/components/ui/Card.tsx";
import { useNewBuildAvailable } from "~/lib/build-version.ts";
import { useT } from "~/lib/i18n.tsx";
import { NOINDEX } from "~/lib/seo.ts";
import { isEditorial, useMe } from "~/lib/session.tsx";

export const Route = createFileRoute("/edit")({
  head: () => ({ meta: [NOINDEX] }),
  component: EditorLayout,
});

/**
 * The editor dashboard shell. The API enforces roles on every route; this
 * guard only keeps learners from seeing a screen that would 403.
 */
function EditorLayout() {
  const t = useT();
  const me = useMe();
  if (me.isPending) return <p className="text-mist">{t("common.loading")}</p>;
  if (!isEditorial(me.data)) {
    // Said in the UI language, with the one sensible next step (W14): a
    // signed-in learner goes back to learning, a visitor signs in.
    return (
      <Card className="mx-auto max-w-md text-center" data-testid="editor-denied">
        <h1 className="mb-2 font-display text-2xl font-bold text-indigo">
          {t("edit.deniedTitle")}
        </h1>
        <p className="mb-5 text-mist">{me.data ? t("edit.deniedBody") : t("edit.deniedSignIn")}</p>
        {me.data ? (
          <ButtonLink to="/" variant="indigo">
            {t("edit.backToLearning")}
          </ButtonLink>
        ) : (
          <ButtonLink to="/auth" variant="indigo">
            {t("nav.signIn")}
          </ButtonLink>
        )}
      </Card>
    );
  }
  const tab =
    "rounded-2xl px-3 py-1.5 text-sm font-semibold text-indigo/80 hover:bg-sand-deep [&.active]:bg-ochre-deep [&.active]:text-white";
  return (
    <div>
      <nav
        className="mb-6 flex flex-wrap gap-2 border-b border-sand-deep pb-3"
        aria-label={t("a11y.editorNav")}
      >
        {/* The queue first: an editor who sits down sees what needs doing,
            not the filing cabinet. The grid is a tab of its own. */}
        <Link to="/edit" className={tab} activeOptions={{ exact: true }}>
          {t("edit.tabs.overview")}
        </Link>
        <Link to="/edit/content" className={tab}>
          {t("edit.tabs.content")}
        </Link>
        <Link to="/edit/curriculum" className={tab}>
          {t("edit.tabs.curriculum")}
        </Link>
        <Link to="/edit/grammar" className={tab}>
          {t("edit.tabs.grammar")}
        </Link>
        <Link to="/edit/sentences" className={tab}>
          {t("edit.tabs.sentences")}
        </Link>
        {/* The tutor's two pages: what only a speaker can supply. */}
        <Link to="/edit/write" className={tab}>
          {t("edit.tabs.write")}
        </Link>
        <Link to="/edit/culture" className={tab}>
          {t("edit.tabs.culture")}
        </Link>
        <Link to="/edit/review" className={tab}>
          {t("edit.tabs.review")}
        </Link>
        <Link to="/edit/studio" className={tab}>
          {t("edit.tabs.studio")}
        </Link>
        <Link to="/edit/goldens" className={tab}>
          {t("edit.tabs.goldens")}
        </Link>
      </nav>
      <NewVersionBanner />
      <Outlet />
    </div>
  );
}

/**
 * A tutor keeps /edit/goldens or the studio open for hours; a deploy in
 * between leaves her on the old page. This says so, once a newer build is
 * being served, and refreshes on request: never by itself, since a card or
 * a take may be half done.
 */
function NewVersionBanner() {
  const t = useT();
  const newer = useNewBuildAvailable();
  if (!newer) return null;
  return (
    <div
      role="status"
      className="mb-6 flex flex-wrap items-center gap-3 rounded-2xl bg-sun-soft p-4 text-ink"
      data-testid="new-version"
    >
      <p className="min-w-0 flex-1">{t("edit.newVersion.text")}</p>
      <Button type="button" size="sm" onClick={() => window.location.reload()}>
        {t("edit.newVersion.refresh")}
      </Button>
    </div>
  );
}
