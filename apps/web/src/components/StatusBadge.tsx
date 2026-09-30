import { useT } from "~/lib/i18n.tsx";

const COLOURS: Record<string, string> = {
  draft: "bg-stone-200 text-stone-800",
  ai_draft: "bg-purple-100 text-purple-800 ring-1 ring-purple-400",
  in_review: "bg-amber-100 text-amber-800",
  published: "bg-green-100 text-green-800",
  retired: "bg-stone-100 text-stone-500 line-through",
};

/** Status chip; `ai_draft` is visibly different because a learner must never mistake it for reviewed content. */
export function StatusBadge({ status }: { status: string }) {
  const t = useT();
  const label = (["draft", "ai_draft", "in_review", "published", "retired"] as const).includes(
    status as never,
  )
    ? t(`edit.status.${status as "draft"}`)
    : status;
  return (
    <span
      className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ${COLOURS[status] ?? "bg-stone-100"}`}
    >
      {label}
    </span>
  );
}
