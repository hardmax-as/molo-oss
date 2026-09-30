import {
  previewExerciseContent,
  type PreviewPathResponse,
  type PreviewUnitResponse,
  type Status,
} from "@molo/core";
import { useQuery } from "@tanstack/react-query";
import { Navigate, useNavigate } from "@tanstack/react-router";
import { useState, useSyncExternalStore } from "react";

import { api } from "~/lib/api.ts";
import { useLang, useT } from "~/lib/i18n.tsx";
import { usePreview } from "~/lib/use-preview.ts";

import { Exercise } from "./exercises/Runner.tsx";
import { Button } from "./ui/Button.tsx";
import { Card } from "./ui/Card.tsx";

export function PreviewStatus({ status }: { status: Status }) {
  const t = useT();
  return status === "published" ? null : (
    <span className="rounded-full bg-sun/40 px-3 py-1 text-sm text-indigo">
      {t(`edit.status.${status}`)}
    </span>
  );
}

export function PreviewSwitch() {
  const t = useT();
  const preview = usePreview();
  const navigate = useNavigate();
  if (!preview.allowed) return null;
  return (
    <Card>
      <label className="flex items-center justify-between gap-3 font-semibold text-indigo">
        {t("preview.switch")}
        <input
          type="checkbox"
          role="switch"
          checked={preview.enabled}
          onChange={(e) => {
            preview.setEnabled(e.target.checked);
            void navigate({ to: e.target.checked ? "/preview" : "/" });
          }}
        />
      </label>
    </Card>
  );
}

export function PreviewBanner() {
  const t = useT();
  const preview = usePreview();
  const navigate = useNavigate();
  if (!preview.enabled) return null;
  return (
    <aside
      role="status"
      className="sticky top-0 z-50 flex flex-wrap items-center justify-between gap-3 bg-sun px-4 py-3 font-semibold text-indigo"
    >
      <span>{t("preview.banner")}</span>
      <button
        type="button"
        className="underline"
        onClick={() => {
          preview.setEnabled(false);
          void navigate({ to: "/" });
        }}
      >
        {t("preview.exit")}
      </button>
    </aside>
  );
}

function subscribeConnection(listener: () => void) {
  window.addEventListener("online", listener);
  window.addEventListener("offline", listener);
  return () => {
    window.removeEventListener("online", listener);
    window.removeEventListener("offline", listener);
  };
}

export function EditorPreview() {
  const online = useSyncExternalStore(
    subscribeConnection,
    () => navigator.onLine,
    () => true,
  );
  const t = useT();
  const { lang } = useLang();
  const preview = usePreview();
  const [slug, setSlug] = useState<string | null>(null);
  const [lessonId, setLessonId] = useState<string | null>(null);
  const path = useQuery({
    queryKey: ["editor-preview", preview.actorId, "path", lang],
    queryFn: () => api<PreviewPathResponse>(`/edit/preview/path?lang=${lang}`),
    enabled: preview.enabled && online && !slug,
    gcTime: 0,
    staleTime: 0,
  });
  const unitQuery = useQuery({
    queryKey: ["editor-preview", preview.actorId, "unit", slug, lang],
    queryFn: () =>
      api<PreviewUnitResponse>(`/edit/preview/units/${encodeURIComponent(slug!)}?lang=${lang}`),
    enabled: preview.enabled && online && !!slug,
    gcTime: 0,
    staleTime: 0,
  });
  if (!preview.enabled) return <Navigate to="/" replace />;
  if (!online) return <p>{t("preview.connection")}</p>;
  if (slug) {
    if (unitQuery.isError) return <p className="text-coral-deep">{t("common.error")}</p>;
    if (!unitQuery.data) return <p>{t("common.loading")}</p>;
    const data = unitQuery.data;
    const selectedLesson = data.unit.skills
      .flatMap((s) => s.lessons)
      .find((l) => l.id === lessonId);
    return (
      <section className="space-y-4">
        <Button
          variant="outline"
          onClick={() => {
            setSlug(null);
            setLessonId(null);
          }}
        >
          {t("preview.path")}
        </Button>
        <h1 className="font-display text-3xl text-indigo">
          {t(data.unit.titleKey as never) || data.unit.slug}
        </h1>
        <PreviewStatus status={data.unit.status} />
        {selectedLesson ? (
          <PreviewLesson
            key={selectedLesson.id}
            content={data}
            lesson={selectedLesson}
            leave={() => setLessonId(null)}
          />
        ) : (
          data.unit.skills.map((skill) => (
            <Card key={skill.id}>
              <h2 className="mb-3 font-display text-xl text-indigo">
                {t(skill.titleKey as never) || skill.slug}
              </h2>
              <PreviewStatus status={skill.status} />
              {skill.lessons.map((lesson) => (
                <div key={lesson.id} className="my-3 flex items-center gap-3">
                  <Button variant="outline" onClick={() => setLessonId(lesson.id)}>
                    {t("preview.lesson", { number: lesson.order })}
                  </Button>
                  <PreviewStatus status={lesson.status} />
                </div>
              ))}
            </Card>
          ))
        )}
      </section>
    );
  }
  if (path.isError) return <p className="text-coral-deep">{t("common.error")}</p>;
  if (!path.data) return <p>{t("common.loading")}</p>;
  return (
    <section className="space-y-4">
      <h1 className="font-display text-3xl text-indigo">{t("preview.switch")}</h1>
      {!path.data.units.length && <p>{t("preview.empty")}</p>}
      {path.data.units.map((unit) => (
        <Card key={unit.id} className="space-y-3" data-testid={`preview-unit-${unit.slug}`}>
          <h2 className="font-display text-xl text-indigo">
            {t(unit.titleKey as never) || unit.slug}
          </h2>
          <PreviewStatus status={unit.status} />
          <div>
            <Button onClick={() => setSlug(unit.slug)}>{t("preview.open")}</Button>
          </div>
        </Card>
      ))}
    </section>
  );
}

function PreviewLesson({
  content,
  lesson,
  leave,
}: {
  content: PreviewUnitResponse;
  lesson: PreviewUnitResponse["unit"]["skills"][number]["lessons"][number];
  leave: () => void;
}) {
  const t = useT();
  const [index, setIndex] = useState(0);
  const exercise = lesson.exercises[index];
  const material = exercise ? previewExerciseContent(exercise.payload, content) : null;
  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <h2>{t("preview.lesson", { number: lesson.order })}</h2>
        <PreviewStatus status={lesson.status} />
      </div>
      <Button variant="outline" onClick={leave}>
        {t("preview.unit")}
      </Button>
      {exercise && material ? (
        <Card className="space-y-4">
          <div className="flex items-center gap-3">
            <h3>{t("preview.exercise", { number: index + 1 })}</h3>
            <PreviewStatus status={exercise.status} />
          </div>
          {material.missingAudio.map((label, i) => (
            <p key={i} className="text-coral-deep">
              {label ? t("preview.missingAudio", { content: label }) : t("lesson.noAudio")}
            </p>
          ))}
          {material.payload && !material.missingContent ? (
            <Exercise
              key={exercise.id}
              payload={material.payload}
              content={content}
              onDone={() => setIndex((n) => n + 1)}
              quiet={false}
            />
          ) : (
            <p>{t("preview.missingContent")}</p>
          )}
          <Button variant="outline" onClick={() => setIndex((n) => n + 1)}>
            {t("preview.next")}
          </Button>
        </Card>
      ) : (
        <p role="status">{t("preview.finished")}</p>
      )}
    </div>
  );
}
