import { createFileRoute } from "@tanstack/react-router";
import { RotateCcw } from "lucide-react";
import { useState } from "react";

import { KNOB_GROUPS, knobsIn, xpJustBelowNextLevel, type KnobId } from "~/dev/knobs.ts";
import { useKnobs } from "~/dev/knobs.tsx";
import { DEV_STRINGS } from "~/dev/strings.ts";

export const Route = createFileRoute("/dev/knobs")({ component: KnobsPanel });

const S = DEV_STRINGS.knobs;

const button =
  "rounded-2xl border border-mist-soft bg-cloud px-3 py-1.5 text-sm font-semibold text-indigo hover:bg-sand";

/**
 * The knobs panel (docs/DESIGN.md, "Developer gallery"). Every gamification
 * constant, turnable for this browser session, with the demos and the real
 * screens reading the result.
 *
 * Gated by `/dev`'s layout route, which is also where the override store is
 * armed, so a production bundle cannot apply an override to a learner. All
 * of the copy here is developer-only English from `~/dev/strings.ts`, the
 * one file in `apps/web` allowed to hold untranslated text.
 *
 * Nothing on this page writes to the database or calls a paid API, and
 * nothing it changes reaches the server: the panel says so twice, because
 * the first bug report will otherwise be "the numbers do not persist".
 */
function KnobsPanel() {
  const { state, tuning, active, count, setKnob, setFake, reset } = useKnobs();

  return (
    <section className="space-y-8" data-testid="dev-knobs">
      <header className="space-y-2">
        <h1 className="font-display text-3xl font-bold text-indigo">{S.title}</h1>
        <p className="max-w-3xl text-mist">{S.intro}</p>
        <p className="max-w-3xl rounded-2xl bg-cloud px-4 py-2 text-sm font-semibold text-ink">
          {S.serverNote}
        </p>
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={reset}
            disabled={!active}
            className={`${button} inline-flex items-center gap-1.5 disabled:opacity-40`}
            data-testid="knobs-reset"
          >
            <RotateCcw size={14} aria-hidden /> {S.reset}
          </button>
          <span className="text-xs text-mist" data-testid="knobs-count">
            {active ? S.bannerCount(count) : S.nothingSet}
          </span>
        </div>
      </header>

      {KNOB_GROUPS.map((group) => (
        <section key={group} className="space-y-2" data-testid={`knob-group-${group}`}>
          <h2 className="text-xs font-bold uppercase tracking-widest text-mist">
            {S.groups[group]}
          </h2>
          <div className="grid gap-2 sm:grid-cols-2">
            {knobsIn(group).map((spec) => (
              <Knob
                key={spec.id}
                id={spec.id as KnobId}
                label={spec.label}
                hint={spec.hint}
                shipped={spec.value}
                min={spec.min}
                max={spec.max}
                step={spec.step}
                unit={spec.unit}
                value={state.overrides[spec.id as KnobId]}
                onChange={setKnob}
              />
            ))}
          </div>
        </section>
      ))}

      {/* ---- fabricated states ------------------------------------------ */}
      <section className="space-y-3" data-testid="knob-group-states">
        <h2 className="text-xs font-bold uppercase tracking-widest text-mist">{S.states.title}</h2>
        <p className="max-w-3xl text-sm text-mist">{S.states.hint}</p>
        <div className="grid gap-3 sm:grid-cols-2">
          <StreakSetter
            days={state.fake.streakDays}
            onSet={(streakDays) => setFake({ streakDays })}
          />

          <FakeCard
            title={S.states.heartsEmpty}
            hint={S.states.heartsEmptyHint}
            set={state.fake.hearts !== null}
            onClear={() => setFake({ hearts: null })}
          >
            <button
              type="button"
              className={button}
              onClick={() => setFake({ hearts: 0 })}
              data-testid="fake-hearts-empty"
            >
              {S.states.heartsEmpty}
            </button>
            <button
              type="button"
              className={button}
              onClick={() => setFake({ hearts: tuning.hearts.max })}
            >
              {S.states.heartsFull}
            </button>
          </FakeCard>

          <FakeCard
            title={S.states.xpNearLevel}
            hint={S.states.xpNearLevelHint}
            set={state.fake.xpTotal !== null}
            onClear={() => setFake({ xpTotal: null })}
          >
            <button
              type="button"
              className={button}
              onClick={() =>
                setFake({ xpTotal: xpJustBelowNextLevel(state.fake.xpTotal ?? 0, tuning) })
              }
              data-testid="fake-xp-near-level"
            >
              {state.fake.xpTotal === null
                ? S.states.xpNearLevel
                : `${S.states.xpNearLevel} · ${state.fake.xpTotal} XP`}
            </button>
          </FakeCard>

          <UnitSetter
            slug={state.fake.finishedUnitSlug}
            onSet={(finishedUnitSlug) => setFake({ finishedUnitSlug })}
          />
        </div>
      </section>
    </section>
  );
}

/** One number, with the shipped value beside it and a way back to it. */
function Knob({
  id,
  label,
  hint,
  shipped,
  min,
  max,
  step,
  unit,
  value,
  onChange,
}: {
  id: KnobId;
  label: string;
  hint: string;
  shipped: number;
  min: number;
  max: number;
  step: number;
  unit?: string | undefined;
  value: number | undefined;
  onChange: (id: KnobId, value: number | null) => void;
}) {
  const overridden = value !== undefined;
  const commit = (raw: string) => {
    const next = Number(raw);
    if (!Number.isFinite(next)) return;
    onChange(id, Math.max(min, Math.min(max, next)));
  };
  return (
    <div
      className={`rounded-2xl border p-3 ${overridden ? "border-sun bg-sun/10" : "border-sand-deep bg-white"}`}
    >
      <label className="block text-sm font-semibold text-ink" htmlFor={`knob-${id}`}>
        {label}
      </label>
      <p className="text-xs text-mist">{hint}</p>
      <div className="mt-1.5 flex items-center gap-2">
        <input
          id={`knob-${id}`}
          type="number"
          inputMode="numeric"
          min={min}
          max={max}
          step={step}
          value={value ?? shipped}
          onChange={(e) => commit(e.target.value)}
          // Also on blur, because a value set any way other than by typing
          // — a script, a browser autofill, a test — updates React's own
          // change tracker as it goes and so never reaches `onChange`. The
          // field would then show a number the app was not using.
          onBlur={(e) => commit(e.currentTarget.value)}
          className="w-24 rounded-xl border border-mist-soft bg-white px-2 py-1 text-sm tabular-nums"
          data-testid={`knob-${id}`}
        />
        {unit && <span className="text-xs text-mist">{unit}</span>}
        <span className="ml-auto text-xs text-mist tabular-nums">
          {shipped} {DEV_STRINGS.knobs.shipped}
        </span>
        {overridden && (
          <button
            type="button"
            className="rounded-xl px-2 py-1 text-xs font-semibold text-indigo underline"
            onClick={() => onChange(id, null)}
          >
            {S.resetOne}
          </button>
        )}
      </div>
    </div>
  );
}

/** A fabricated state, with the same shape as a knob so the page reads evenly. */
function FakeCard({
  title,
  hint,
  set,
  onClear,
  children,
}: {
  title: string;
  hint: string;
  set: boolean;
  onClear: () => void;
  children: React.ReactNode;
}) {
  return (
    <div
      className={`rounded-2xl border p-3 ${set ? "border-sun bg-sun/10" : "border-sand-deep bg-white"}`}
    >
      <p className="text-sm font-semibold text-ink">
        {title}{" "}
        {set && (
          <span className="rounded-full bg-sun px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-indigo">
            {S.states.active}
          </span>
        )}
      </p>
      <p className="text-xs text-mist">{hint}</p>
      <div className="mt-1.5 flex flex-wrap items-center gap-2">
        {children}
        {set && (
          <button
            type="button"
            className="rounded-xl px-2 py-1 text-xs font-semibold text-indigo underline"
            onClick={onClear}
          >
            {S.states.clear}
          </button>
        )}
      </div>
    </div>
  );
}

function StreakSetter({
  days,
  onSet,
}: {
  days: number | null;
  onSet: (days: number | null) => void;
}) {
  const [draft, setDraft] = useState("30");
  return (
    <FakeCard
      title={S.states.streak}
      hint={S.states.streakHint}
      set={days !== null}
      onClear={() => onSet(null)}
    >
      <label className="sr-only" htmlFor="fake-streak-days">
        {S.states.streakHint}
      </label>
      <input
        id="fake-streak-days"
        type="number"
        min={0}
        max={9999}
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        className="w-24 rounded-xl border border-mist-soft bg-white px-2 py-1 text-sm tabular-nums"
      />
      <button
        type="button"
        className={button}
        onClick={() => {
          const n = Number(draft);
          if (Number.isFinite(n) && n >= 0) onSet(Math.floor(n));
        }}
        data-testid="fake-streak-set"
      >
        {S.states.streakSet}
      </button>
    </FakeCard>
  );
}

function UnitSetter({
  slug,
  onSet,
}: {
  slug: string | null;
  onSet: (slug: string | null) => void;
}) {
  const [draft, setDraft] = useState(slug ?? "");
  return (
    <FakeCard
      title={S.states.unitFinished}
      hint={S.states.unitFinishedHint}
      set={slug !== null}
      onClear={() => onSet(null)}
    >
      <label className="sr-only" htmlFor="fake-unit-slug">
        {S.states.unitFinishedHint}
      </label>
      <input
        id="fake-unit-slug"
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        placeholder="unit-1"
        className="w-40 rounded-xl border border-mist-soft bg-white px-2 py-1 text-sm"
      />
      <button
        type="button"
        className={button}
        onClick={() => onSet(draft.trim() || null)}
        data-testid="fake-unit-set"
      >
        {S.states.unitFinished}
      </button>
    </FakeCard>
  );
}
