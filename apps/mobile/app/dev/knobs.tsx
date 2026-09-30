import { Stack } from "expo-router";
import { useState } from "react";
import { Pressable, Text, TextInput, View } from "react-native";

import { useDevAccess } from "~/dev/access.ts";
import { KNOB_GROUPS, knobsIn, xpJustBelowNextLevel, type KnobId } from "~/dev/knobs.ts";
import { useArmKnobs, useKnobs } from "~/dev/knobs.tsx";
import { DEV_STRINGS } from "~/dev/strings.ts";
import { Button } from "~/ui/Button.tsx";
import { Card } from "~/ui/Card.tsx";
import { Screen } from "~/ui/Screen.tsx";
import { colors } from "~/ui/theme.ts";

const S = DEV_STRINGS.knobs;

/**
 * The knobs panel on a phone (docs/DESIGN.md, "Developer gallery"). The web
 * app's `/dev/knobs`, the same model and the same knob ids — every
 * gamification constant turnable for this install, with the real screens
 * and the demos reading the result, so the celebration can be watched at a
 * different number without editing a file.
 *
 * Gated by `useDevAccess()`, which is also what arms the override store, so
 * a release build cannot apply an override to a learner. All of the copy
 * here is developer-only English from `~/dev/strings.ts`, the one file in
 * `apps/mobile` allowed to hold untranslated text.
 *
 * Nothing on this screen writes to the database or calls a paid API, and
 * nothing it changes reaches the server: the panel says so twice, because
 * the first bug report will otherwise be "the numbers do not persist".
 */
export default function KnobsScreen() {
  const allowed = useDevAccess();
  useArmKnobs(allowed);
  const { state, tuning, active, count, setKnob, setFake, reset } = useKnobs();

  if (!allowed) return null;

  return (
    <>
      <Stack.Screen options={{ title: S.title }} />
      <Screen testID="dev-knobs">
        <Card index={0} className="gap-3">
          <Text className="font-body text-sm text-mist">{S.intro}</Text>
          <Text className="font-body-semibold text-sm text-ink">{S.serverNote}</Text>
          <Text className="font-body text-xs text-mist" testID="knobs-count">
            {active ? S.bannerCount(count) : S.nothingSet}
          </Text>
          <Button
            label={S.reset}
            variant="cloud"
            full
            disabled={!active}
            onPress={reset}
            testID="knobs-reset"
          />
        </Card>

        {KNOB_GROUPS.map((group, i) => (
          <View key={group} className="gap-2" testID={`knob-group-${group}`}>
            <Text className="font-body-bold text-xs uppercase tracking-wide text-mist">
              {S.groups[group]}
            </Text>
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
                index={i}
              />
            ))}
          </View>
        ))}

        {/* ---- fabricated states ----------------------------------------- */}
        <View className="gap-2" testID="knob-group-states">
          <Text className="font-body-bold text-xs uppercase tracking-wide text-mist">
            {S.states.title}
          </Text>
          <Text className="font-body text-xs text-mist">{S.states.hint}</Text>

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
            <Button
              label={S.states.heartsEmpty}
              variant="cloud"
              size="sm"
              onPress={() => setFake({ hearts: 0 })}
              testID="fake-hearts-empty"
            />
            <Button
              label={S.states.heartsFull}
              variant="cloud"
              size="sm"
              onPress={() => setFake({ hearts: tuning.hearts.max })}
            />
          </FakeCard>

          <FakeCard
            title={S.states.xpNearLevel}
            hint={S.states.xpNearLevelHint}
            set={state.fake.xpTotal !== null}
            onClear={() => setFake({ xpTotal: null })}
          >
            <Button
              label={
                state.fake.xpTotal === null
                  ? S.states.xpNearLevel
                  : `${state.fake.xpTotal} ${S.units.xp}`
              }
              variant="cloud"
              size="sm"
              onPress={() =>
                setFake({ xpTotal: xpJustBelowNextLevel(state.fake.xpTotal ?? 0, tuning) })
              }
              testID="fake-xp-near-level"
            />
          </FakeCard>

          <UnitSetter
            slug={state.fake.finishedUnitSlug}
            onSet={(finishedUnitSlug) => setFake({ finishedUnitSlug })}
          />
        </View>
      </Screen>
    </>
  );
}

/** One number: steppers for a thumb, a field for a big jump, and a way back. */
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
  index,
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
  index: number;
}) {
  const overridden = value !== undefined;
  const current = value ?? shipped;
  const [draft, setDraft] = useState<string | null>(null);
  const clamp = (n: number) => Math.max(min, Math.min(max, n));
  const commit = (raw: string) => {
    setDraft(null);
    const next = Number(raw);
    if (!Number.isFinite(next)) return;
    onChange(id, clamp(Math.round(next)));
  };
  return (
    <Card index={index} tone={overridden ? "sun" : "cloud"} className="gap-1 p-4">
      <Text className="font-body-semibold text-base text-ink">{label}</Text>
      <Text className="font-body text-xs text-mist">{hint}</Text>
      <View className="mt-1 flex-row items-center gap-2">
        <Stepper
          glyph="−"
          label={S.decrease(label)}
          onPress={() => onChange(id, clamp(current - step))}
          testID={`knob-${id}-less`}
        />
        <TextInput
          value={draft ?? String(current)}
          onChangeText={setDraft}
          onEndEditing={(e) => commit(e.nativeEvent.text)}
          onBlur={() => (draft === null ? undefined : commit(draft))}
          keyboardType="number-pad"
          selectTextOnFocus
          accessibilityLabel={label}
          placeholderTextColor={colors.mist}
          className="min-h-11 w-20 rounded-2xl border-2 border-cloud-deep bg-cloud px-3 text-center font-body text-base text-ink"
          testID={`knob-${id}`}
        />
        <Stepper
          glyph="+"
          label={S.increase(label)}
          onPress={() => onChange(id, clamp(current + step))}
          testID={`knob-${id}-more`}
        />
        {unit === undefined ? null : <Text className="font-body text-xs text-mist">{unit}</Text>}
        <Text className="ml-auto font-body text-xs text-mist">
          {shipped} {S.shipped}
        </Text>
      </View>
      {overridden && (
        <View className="mt-1 flex-row">
          <Button
            label={S.resetOne}
            variant="ghost"
            size="sm"
            onPress={() => onChange(id, null)}
            testID={`knob-${id}-reset`}
          />
        </View>
      )}
    </Card>
  );
}

function Stepper({
  glyph,
  label,
  onPress,
  testID,
}: {
  glyph: string;
  label: string;
  onPress: () => void;
  testID: string;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      className="h-11 w-11 items-center justify-center rounded-2xl bg-sand-deep"
      testID={testID}
    >
      <Text className="font-display-bold text-lg text-indigo">{glyph}</Text>
    </Pressable>
  );
}

/** A fabricated state, with the same shape as a knob so the screen reads evenly. */
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
    <Card index={0} tone={set ? "sun" : "cloud"} className="gap-1 p-4">
      <Text className="font-body-semibold text-base text-ink">
        {title}
        {set ? ` · ${S.states.active}` : ""}
      </Text>
      <Text className="font-body text-xs text-mist">{hint}</Text>
      <View className="mt-2 flex-row flex-wrap items-center gap-2">
        {children}
        {set && <Button label={S.states.clear} variant="ghost" size="sm" onPress={onClear} />}
      </View>
    </Card>
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
      <TextInput
        value={draft}
        onChangeText={setDraft}
        keyboardType="number-pad"
        accessibilityLabel={S.states.streakHint}
        placeholderTextColor={colors.mist}
        className="min-h-11 w-20 rounded-2xl border-2 border-cloud-deep bg-cloud px-3 text-center font-body text-base text-ink"
        testID="fake-streak-days"
      />
      <Button
        label={S.states.streakSet}
        variant="cloud"
        size="sm"
        onPress={() => {
          const n = Number(draft);
          if (Number.isFinite(n) && n >= 0) onSet(Math.floor(n));
        }}
        testID="fake-streak-set"
      />
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
      <TextInput
        value={draft}
        onChangeText={setDraft}
        autoCapitalize="none"
        autoCorrect={false}
        placeholder="unit-1"
        accessibilityLabel={S.states.unitFinishedHint}
        placeholderTextColor={colors.mist}
        className="min-h-11 flex-1 rounded-2xl border-2 border-cloud-deep bg-cloud px-3 font-body text-base text-ink"
        testID="fake-unit-slug"
      />
      <Button
        label={S.states.unitFinished}
        variant="cloud"
        size="sm"
        onPress={() => onSet(draft.trim() === "" ? null : draft.trim())}
        testID="fake-unit-set"
      />
    </FakeCard>
  );
}
