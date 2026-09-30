import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { ArrowRight, Undo2 } from "lucide-react";

import { getMistakes } from "~/lib/api.ts";
import { useLang, useT } from "~/lib/i18n.tsx";
import { useMe } from "~/lib/session.tsx";

/**
 * The way into "practise mistakes", with the number of words waiting. A
 * guest has no server state, so the entry is not shown at all; the account
 * wall lives on the page itself for anyone who deep-links there.
 */
export function MistakesLink({ className = "" }: { className?: string }) {
  const t = useT();
  const { lang } = useLang();
  const me = useMe();
  const mistakes = useQuery({
    queryKey: ["mistakes", lang],
    queryFn: () => getMistakes(lang),
    enabled: !!me.data,
    staleTime: 30_000,
  });
  const count = mistakes.data?.count ?? 0;
  if (!me.data || count === 0) return null;
  return (
    <Link
      to="/mistakes"
      className={`pressable flex items-center gap-3 rounded-3xl bg-coral-soft p-4 text-ink shadow-card hover:bg-coral-soft/70 ${className}`}
      data-testid="mistakes-link"
    >
      <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-coral text-white">
        <Undo2 size={20} aria-hidden />
      </span>
      <span className="grow">
        <span className="block font-display text-lg font-bold text-indigo">
          {t("mistakes.title")}
        </span>
        <span className="block text-sm text-mist">{t("mistakes.open", { count })}</span>
      </span>
      <ArrowRight size={20} className="text-indigo" aria-hidden />
    </Link>
  );
}
