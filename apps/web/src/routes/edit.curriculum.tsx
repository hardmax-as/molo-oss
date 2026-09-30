import { CEFR_BANDS, SKILL_KINDS } from "@molo/core";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";

import { StatusBadge } from "~/components/StatusBadge.tsx";
import {
  createLesson,
  createSkill,
  createUnit,
  deleteDraft,
  getCurriculum,
  getEditorCourses,
  transition,
  type CurriculumLesson,
  type CurriculumSkill,
  type CurriculumUnit,
} from "~/lib/api.ts";
import { useT } from "~/lib/i18n.tsx";

export const Route = createFileRoute("/edit/curriculum")({ component: CurriculumPage });

const field = "rounded border border-stone-300 px-2 py-1 text-sm";
const small = "rounded px-2 py-1 text-xs font-medium";
type Kind = "unit" | "skill" | "lesson" | "exercise";

/**
 * The course the dashboard is editing. There is one, so the selector
 * defaults to it — but a unit is created against whichever course is
 * chosen, so a second curriculum can never be written into by accident
 * (docs/ARCHITECTURE.md section 2.6).
 */
function useCourses() {
  return useQuery({ queryKey: ["edit-courses"], queryFn: getEditorCourses });
}

function useCurriculumActions() {
  const t = useT();
  const qc = useQueryClient();
  const refresh = () => qc.invalidateQueries({ queryKey: ["curriculum"] });
  const onError = (e: unknown) => toast.error(e instanceof Error ? e.message : t("common.error"));
  const move = useMutation({
    mutationFn: (input: {
      kind: Kind;
      id: string;
      to: "in_review" | "published" | "draft" | "retired";
      note?: string;
    }) =>
      transition({
        kind: input.kind,
        id: input.id,
        to: input.to,
        ...(input.note ? { note: input.note } : {}),
      }),
    onSuccess: async (r) => {
      if (r.ok) toast.success(`${t("edit.filters.status")}: ${r.status}`);
      else toast.error(r.reason);
      await refresh();
    },
    onError,
  });
  const remove = useMutation({
    mutationFn: (input: { kind: Kind; id: string }) => deleteDraft(input.kind, input.id),
    onSuccess: async () => {
      toast.success(t("edit.curriculum.deleted"));
      await refresh();
    },
    onError,
  });
  return { move, remove, refresh, onError };
}

/** Compact status controls shared by every row: promote, approve, reject, retire, delete draft. */
function RowActions({ kind, id, status }: { kind: Kind; id: string; status: string }) {
  const t = useT();
  const { move, remove } = useCurriculumActions();
  const busy = move.isPending || remove.isPending;
  return (
    <span className="flex flex-wrap items-center gap-1">
      {(status === "draft" || status === "ai_draft") && (
        <>
          <button
            type="button"
            disabled={busy}
            className={`${small} bg-amber-600 text-white`}
            onClick={() => move.mutate({ kind, id, to: "in_review" })}
          >
            {t("edit.lexeme.promote")}
          </button>
          <button
            type="button"
            disabled={busy}
            className={`${small} border border-red-700 text-red-700`}
            onClick={() => {
              if (window.confirm(t("edit.curriculum.deleteConfirm"))) remove.mutate({ kind, id });
            }}
          >
            {t("edit.curriculum.delete")}
          </button>
        </>
      )}
      {status === "in_review" && (
        <>
          <button
            type="button"
            disabled={busy}
            className={`${small} bg-green-700 text-white`}
            onClick={() => move.mutate({ kind, id, to: "published" })}
          >
            {t("edit.lexeme.approve")}
          </button>
          <button
            type="button"
            disabled={busy}
            className={`${small} border border-red-700 text-red-700`}
            onClick={() => {
              const note = window.prompt(t("edit.lexeme.rejectNote"));
              if (note?.trim()) move.mutate({ kind, id, to: "draft", note: note.trim() });
            }}
          >
            {t("edit.lexeme.reject")}
          </button>
        </>
      )}
      {status === "published" && (
        <button
          type="button"
          disabled={busy}
          className={`${small} border border-stone-400 text-stone-700`}
          onClick={() => {
            const note = window.prompt(t("edit.lexeme.rejectNote"));
            if (note?.trim()) move.mutate({ kind, id, to: "retired", note: note.trim() });
          }}
        >
          {t("edit.status.retired")}
        </button>
      )}
    </span>
  );
}

function CurriculumPage() {
  const t = useT();
  const courses = useCourses();
  const [courseId, setCourseId] = useState<string | null>(null);
  const chosen = courseId ?? courses.data?.defaultCourseId ?? null;
  const tree = useQuery({
    queryKey: ["curriculum", chosen],
    queryFn: () => getCurriculum(chosen ?? undefined),
    enabled: chosen !== null || courses.isFetched,
  });
  if (tree.isPending) return <p className="text-stone-500">{t("common.loading")}</p>;
  if (tree.isError || !tree.data) return <p className="text-red-700">{t("common.error")}</p>;
  const units = tree.data.units;
  return (
    <section className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <h1 className="text-2xl font-bold">{t("edit.curriculum.title")}</h1>
        <div>
          <label className="text-xs font-medium">
            {t("edit.curriculum.course")}
            <select
              value={chosen ?? ""}
              onChange={(e) => setCourseId(e.target.value)}
              className={`${field} ml-2`}
              aria-describedby="edit-course-hint"
            >
              {(courses.data?.courses ?? []).map((course) => (
                <option key={course.id} value={course.id}>
                  {t(course.titleKey as never) || course.slug} · {course.targetLang}
                </option>
              ))}
            </select>
          </label>
          <p id="edit-course-hint" className="text-xs text-stone-500">
            {t("edit.curriculum.courseHint")}
          </p>
        </div>
      </div>
      {units.length === 0 && <p className="text-stone-500">{t("edit.curriculum.empty")}</p>}
      <ol className="space-y-4">
        {units.map((u) => (
          <UnitRow key={u.id} unit={u} units={units} />
        ))}
      </ol>
      <NewUnitForm courseId={chosen} nextOrder={(units.at(-1)?.order ?? 0) + 1} />
    </section>
  );
}

function UnitRow({ unit, units }: { unit: CurriculumUnit; units: CurriculumUnit[] }) {
  const t = useT();
  const [open, setOpen] = useState(unit.status !== "published");
  const exerciseCount = unit.skills
    .flatMap((s) => s.lessons)
    .reduce((n, l) => n + l.exercises.length, 0);
  return (
    <li className="rounded-lg border border-stone-200 bg-white">
      <div className="flex flex-wrap items-center gap-3 p-4">
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          className="text-stone-500"
          aria-expanded={open}
        >
          {open ? "▾" : "▸"}
        </button>
        <span className="text-xs text-stone-500">{unit.order}</span>
        <h2 className="font-semibold">
          {t(unit.titleKey as never) || unit.slug}{" "}
          <span className="font-normal text-stone-500">· {unit.slug}</span>
        </h2>
        <span className="text-xs uppercase text-stone-500">{unit.cefrBand}</span>
        <StatusBadge status={unit.status} />
        <span className="text-xs text-stone-500">
          {t("edit.curriculum.exercises", { count: exerciseCount })}
        </span>
        {unit.prerequisiteUnitId && (
          <span className="text-xs text-stone-500">
            {t("edit.curriculum.prerequisite")}:{" "}
            {units.find((x) => x.id === unit.prerequisiteUnitId)?.slug ?? "?"}
          </span>
        )}
        <span className="ml-auto">
          <RowActions kind="unit" id={unit.id} status={unit.status} />
        </span>
      </div>
      {open && (
        <div className="space-y-3 border-t border-stone-100 p-4 pl-10">
          {unit.skills.map((s) => (
            <SkillRow key={s.id} skill={s} />
          ))}
          <NewSkillForm unitId={unit.id} nextOrder={(unit.skills.at(-1)?.order ?? 0) + 1} />
        </div>
      )}
    </li>
  );
}

function SkillRow({ skill }: { skill: CurriculumSkill }) {
  const t = useT();
  return (
    // The id is the anchor the landing page's "skills with no sentence yet"
    // links to, so a named gap opens on the skill rather than at the top of
    // the tree. `scroll-mt` keeps it clear of the sticky header.
    <div id={skill.id} className="scroll-mt-24 rounded border border-stone-200 target:bg-sun/10">
      <div className="flex flex-wrap items-center gap-3 p-3">
        <span className="text-xs text-stone-500">{skill.order}</span>
        <h3 className="font-medium">
          {t(skill.titleKey as never) || skill.slug}{" "}
          <span className="font-normal text-stone-500">
            · {skill.slug} · {skill.kind}
          </span>
        </h3>
        <StatusBadge status={skill.status} />
        <span className="ml-auto">
          <RowActions kind="skill" id={skill.id} status={skill.status} />
        </span>
      </div>
      <div className="space-y-2 border-t border-stone-100 p-3 pl-8">
        {skill.lessons.map((l) => (
          <LessonRow key={l.id} lesson={l} />
        ))}
        <NewLessonForm skillId={skill.id} nextOrder={(skill.lessons.at(-1)?.order ?? 0) + 1} />
      </div>
    </div>
  );
}

function LessonRow({ lesson }: { lesson: CurriculumLesson }) {
  const t = useT();
  return (
    <div className="rounded bg-stone-50 p-3">
      <div className="flex flex-wrap items-center gap-3">
        <span className="font-medium">
          {t("edit.curriculum.lesson")} {lesson.order}
        </span>
        <span className="text-xs text-stone-500">{lesson.estimatedMinutes} min</span>
        <StatusBadge status={lesson.status} />
        <span className="text-xs text-stone-500">
          {t("edit.curriculum.exercises", { count: lesson.exercises.length })}
        </span>
        <span className="ml-auto flex items-center gap-2">
          <Link
            to="/edit/exercises/new"
            search={{ lessonId: lesson.id, order: (lesson.exercises.at(-1)?.order ?? 0) + 1 }}
            className={`${small} bg-stone-900 text-white`}
          >
            {t("edit.curriculum.newExercise")}
          </Link>
          <RowActions kind="lesson" id={lesson.id} status={lesson.status} />
        </span>
      </div>
      {lesson.exercises.length > 0 && (
        <ol className="mt-2 space-y-1">
          {lesson.exercises.map((e) => (
            <li key={e.id} className="flex flex-wrap items-center gap-3 text-sm">
              <span className="w-6 text-right text-xs text-stone-500">{e.order}</span>
              <Link to="/edit/exercises/$id" params={{ id: e.id }} className="font-mono underline">
                {e.type}
              </Link>
              <StatusBadge status={e.status} />
              <span className="text-xs text-stone-500">
                {t("edit.curriculum.lexemes", { count: e.lexemeCount })}
              </span>
              {e.note && <span className="text-xs text-amber-800">{e.note}</span>}
              <span className="ml-auto">
                <RowActions kind="exercise" id={e.id} status={e.status} />
              </span>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}

function useCreate<T>(fn: (input: T) => Promise<{ id: string }>) {
  const t = useT();
  const { refresh, onError } = useCurriculumActions();
  return useMutation({
    mutationFn: fn,
    onSuccess: async () => {
      toast.success(t("edit.curriculum.created"));
      await refresh();
    },
    onError,
  });
}

function NewUnitForm({ courseId, nextOrder }: { courseId: string | null; nextOrder: number }) {
  const t = useT();
  const create = useCreate(createUnit);
  const [f, setF] = useState({
    slug: "",
    titleKey: "",
    order: String(nextOrder),
    cefrBand: CEFR_BANDS[0] as string,
  });
  return (
    <form
      className="flex flex-wrap items-end gap-2 rounded-lg border border-dashed border-stone-300 p-4"
      onSubmit={(e) => {
        e.preventDefault();
        create.mutate({
          // The selected course, never an implied one.
          ...(courseId ? { courseId } : {}),
          slug: f.slug,
          titleKey: f.titleKey,
          order: Number(f.order),
          cefrBand: f.cefrBand,
        });
      }}
    >
      <span className="w-full text-sm font-medium">{t("edit.curriculum.newUnit")}</span>
      <label className="text-xs">
        {t("edit.curriculum.slug")}
        <input
          required
          pattern="[a-z0-9]+(-[a-z0-9]+)*"
          value={f.slug}
          onChange={(e) => setF({ ...f, slug: e.target.value })}
          className={`${field} block`}
        />
      </label>
      <label className="text-xs">
        {t("edit.curriculum.titleKey")}
        <input
          required
          value={f.titleKey}
          onChange={(e) => setF({ ...f, titleKey: e.target.value })}
          className={`${field} block`}
          placeholder="units.unit2.title"
        />
      </label>
      <label className="text-xs">
        {t("edit.curriculum.order")}
        <input
          type="number"
          required
          value={f.order}
          onChange={(e) => setF({ ...f, order: e.target.value })}
          className={`${field} block w-20`}
        />
      </label>
      <label className="text-xs">
        {t("edit.curriculum.cefrBand")}
        <select
          value={f.cefrBand}
          onChange={(e) => setF({ ...f, cefrBand: e.target.value })}
          className={`${field} block`}
        >
          {CEFR_BANDS.map((b) => (
            <option key={b}>{b}</option>
          ))}
        </select>
      </label>
      <button
        type="submit"
        disabled={create.isPending}
        className={`${small} bg-stone-900 px-3 py-1.5 text-white`}
      >
        {t("edit.curriculum.create")}
      </button>
    </form>
  );
}

function NewSkillForm({ unitId, nextOrder }: { unitId: string; nextOrder: number }) {
  const t = useT();
  const create = useCreate(createSkill);
  const [f, setF] = useState({
    slug: "",
    titleKey: "",
    order: String(nextOrder),
    kind: SKILL_KINDS[0] as string,
  });
  return (
    <form
      className="flex flex-wrap items-end gap-2 rounded border border-dashed border-stone-300 p-3"
      onSubmit={(e) => {
        e.preventDefault();
        create.mutate({
          unitId,
          slug: f.slug,
          titleKey: f.titleKey,
          order: Number(f.order),
          kind: f.kind,
        });
      }}
    >
      <span className="w-full text-xs font-medium">{t("edit.curriculum.newSkill")}</span>
      <input
        required
        pattern="[a-z0-9]+(-[a-z0-9]+)*"
        value={f.slug}
        onChange={(e) => setF({ ...f, slug: e.target.value })}
        className={field}
        aria-label={t("edit.curriculum.slug")}
        placeholder={t("edit.curriculum.slug")}
      />
      <input
        required
        value={f.titleKey}
        onChange={(e) => setF({ ...f, titleKey: e.target.value })}
        className={field}
        aria-label={t("edit.curriculum.titleKey")}
        placeholder={t("edit.curriculum.titleKey")}
      />
      <input
        type="number"
        required
        value={f.order}
        onChange={(e) => setF({ ...f, order: e.target.value })}
        className={`${field} w-20`}
        aria-label={t("edit.curriculum.order")}
      />
      <select
        value={f.kind}
        onChange={(e) => setF({ ...f, kind: e.target.value })}
        className={field}
        aria-label={t("edit.curriculum.kind")}
      >
        {SKILL_KINDS.map((k) => (
          <option key={k}>{k}</option>
        ))}
      </select>
      <button
        type="submit"
        disabled={create.isPending}
        className={`${small} bg-stone-900 px-3 py-1.5 text-white`}
      >
        {t("edit.curriculum.create")}
      </button>
    </form>
  );
}

function NewLessonForm({ skillId, nextOrder }: { skillId: string; nextOrder: number }) {
  const t = useT();
  const create = useCreate(createLesson);
  const [f, setF] = useState({ order: String(nextOrder), estimatedMinutes: "5" });
  return (
    <form
      className="flex flex-wrap items-end gap-2 text-xs"
      onSubmit={(e) => {
        e.preventDefault();
        create.mutate({
          skillId,
          order: Number(f.order),
          estimatedMinutes: Number(f.estimatedMinutes),
        });
      }}
    >
      <span className="font-medium">{t("edit.curriculum.newLesson")}</span>
      <input
        type="number"
        required
        value={f.order}
        onChange={(e) => setF({ ...f, order: e.target.value })}
        className={`${field} w-16`}
        aria-label={t("edit.curriculum.order")}
        title={t("edit.curriculum.order")}
      />
      <input
        type="number"
        required
        min={1}
        max={60}
        value={f.estimatedMinutes}
        onChange={(e) => setF({ ...f, estimatedMinutes: e.target.value })}
        className={`${field} w-16`}
        aria-label={t("edit.curriculum.estimatedMinutes")}
        title={t("edit.curriculum.estimatedMinutes")}
      />
      <button
        type="submit"
        disabled={create.isPending}
        className={`${small} bg-stone-900 text-white`}
      >
        {t("edit.curriculum.create")}
      </button>
    </form>
  );
}
