import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { toast } from "sonner";

import { ExerciseForm } from "~/components/ExerciseForm.tsx";
import { useT } from "~/lib/i18n.tsx";

export const Route = createFileRoute("/edit/exercises/new")({
  validateSearch: (search: Record<string, unknown>) => ({
    lessonId: String(search["lessonId"] ?? ""),
    order: Number(search["order"] ?? 1),
  }),
  component: NewExercisePage,
});

function NewExercisePage() {
  const { lessonId, order } = Route.useSearch();
  const t = useT();
  const navigate = useNavigate();
  if (!lessonId) return <p className="text-red-700">{t("common.error")}</p>;
  return (
    <section className="space-y-4">
      <h1 className="text-2xl font-bold">{t("edit.exercise.new")}</h1>
      <ExerciseForm
        mode="new"
        lessonId={lessonId}
        order={order}
        onCreated={(id) => {
          toast.success(t("edit.curriculum.created"));
          void navigate({ to: "/edit/exercises/$id", params: { id } });
        }}
      />
    </section>
  );
}
