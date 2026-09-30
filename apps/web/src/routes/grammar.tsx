import type { GrammarReferenceEntry } from "@molo/core";
import { useQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { Lock } from "lucide-react";
import { useState } from "react";

import { GrammarNote } from "~/components/grammar/GrammarNote.tsx";
import { Button } from "~/components/ui/Button.tsx";
import { Card } from "~/components/ui/Card.tsx";
import { getGrammar } from "~/lib/api.ts";
import { readSeenNotes } from "~/lib/grammar-seen.ts";
import { useLang, useT } from "~/lib/i18n.tsx";

export const Route = createFileRoute("/grammar")({ component: GrammarPage });

/**
 * The reference page (docs/GRAMMAR.md section 1: "a reference page stays
 * available for anyone who wants to go back to it"). Every rule the learner
 * has unlocked, with the same worked example, rule and audio-carrying
 * paradigm the lesson showed — the real component, so the two can never
 * drift apart.
 *
 * "Unlocked" is the server's answer for a signed-in learner (a finished
 * lesson in the note's skill) and, for a guest, whichever notes this browser
 * has actually been shown. The ones still ahead are counted rather than
 * listed, so the page says what is coming without giving it away.
 */
function GrammarPage() {
  const t = useT();
  const { lang } = useLang();
  const query = useQuery({ queryKey: ["grammar", lang], queryFn: () => getGrammar(lang) });
  const [showLocked, setShowLocked] = useState(false);

  if (query.isPending) return <p className="text-mist">{t("common.loading")}</p>;
  if (query.isError || !query.data) return <p className="text-coral-deep">{t("common.error")}</p>;

  // A guest has no finished lessons on the server, so the device's own record
  // of what it has shown stands in for the unlock.
  const seen = readSeenNotes();
  const isOpen = (n: GrammarReferenceEntry) => n.unlocked || seen.includes(n.id);
  const notes = query.data.notes;
  const open = notes.filter(isOpen);
  const locked = notes.filter((n) => !isOpen(n));

  return (
    <div className="mx-auto max-w-3xl">
      {/* The crane belongs to the note itself, where the explaining happens;
          a second one in the page header is just two of the same bird. */}
      <header className="mb-6">
        <h1 className="font-display text-3xl font-bold text-indigo sm:text-4xl">
          {t("grammar.title")}
        </h1>
        <p className="mt-2 max-w-prose text-mist">{t("grammar.subtitle")}</p>
      </header>

      {open.length === 0 && locked.length === 0 && (
        <Card tone="sand">
          <p className="text-ink">{t("grammar.reference.empty")}</p>
        </Card>
      )}

      <div className="space-y-6">
        {open.map((note) => (
          <section key={note.id}>
            <p className="mb-2 font-body text-xs font-bold tracking-wide text-mist uppercase">
              {t("grammar.reference.inSkill", {
                unit: t(note.unitTitleKey as never) || note.unitSlug,
                skill: t(note.skillTitleKey as never) || note.slug,
              })}
            </p>
            {/* The same component the lesson uses. A page that kept its own
                copy would drift and then lie. */}
            <GrammarNote note={note} audio={query.data.audioAssets} heading="h2" />
          </section>
        ))}
      </div>

      {locked.length > 0 && (
        <div className="mt-8">
          <div className="flex flex-wrap items-center gap-3">
            <p className="flex items-center gap-2 text-sm font-semibold text-mist">
              <Lock size={16} aria-hidden />
              {t("grammar.reference.lockedCount", { count: locked.length })}
            </p>
            <Button variant="ghost" size="sm" onClick={() => setShowLocked((v) => !v)}>
              {showLocked ? t("grammar.reference.hideLocked") : t("grammar.reference.showLocked")}
            </Button>
          </div>
          {showLocked && (
            <ul className="mt-4 space-y-3">
              {locked.map((note) => (
                <li key={note.id}>
                  {/* A locked rule shows its title and nothing else. Half a
                      worked example would give the rule away and read to a
                      screen reader as a fragment of a word. */}
                  <Card tone="sand" className="flex flex-wrap items-center justify-between gap-3">
                    <div className="min-w-0">
                      <h2 className="font-display text-lg font-bold text-indigo">{note.title}</h2>
                      <p className="text-sm text-mist">{t("grammar.reference.lockedHint")}</p>
                    </div>
                    <Lock size={18} className="shrink-0 text-mist" aria-hidden />
                  </Card>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
