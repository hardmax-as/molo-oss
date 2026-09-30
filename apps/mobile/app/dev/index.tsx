import { useQueryClient } from "@tanstack/react-query";
import Constants from "expo-constants";
import { Stack, useRouter, type Href } from "expo-router";
import { Pressable, Text, View } from "react-native";

import { useDevAccess } from "~/dev/access.ts";
import { groupedDemos, type DemoEntry } from "~/dev/catalog.ts";
import { useArmKnobs } from "~/dev/knobs.tsx";
import { DEV_STRINGS } from "~/dev/strings.ts";
import { apiUrl } from "~/lib/api-url.ts";
import { clearGuest } from "~/lib/guest.ts";
import { useModes } from "~/lib/modes.tsx";
import { resetOnboarding } from "~/lib/onboarding.ts";
import { usePrefs } from "~/lib/prefs.tsx";
import { useMe, useSignOut } from "~/lib/session.tsx";
import { Button } from "~/ui/Button.tsx";
import { Card } from "~/ui/Card.tsx";
import { useMotion } from "~/ui/motion.ts";
import { Screen } from "~/ui/Screen.tsx";
import { Switch } from "~/ui/Switch.tsx";
import { useToast } from "~/ui/Toast.tsx";

/**
 * The developer gallery (docs/DESIGN.md "Developer gallery"). Every screen
 * and every celebration, opened directly instead of played towards — nobody
 * should have to keep a streak alive for a week to look at the screen that
 * congratulates them for it.
 *
 * Reachable from a `__DEV__` build or an `admin` account and from nowhere
 * else (`~/dev/access.ts`), and every label on it is developer-only English
 * from `~/dev/strings.ts`. Nothing here writes to the database or calls a
 * paid API.
 */
export default function DeveloperScreen() {
  const allowed = useDevAccess();
  const router = useRouter();
  const me = useMe();
  const signOut = useSignOut();
  const qc = useQueryClient();
  const prefs = usePrefs();
  const motion = useMotion();
  const modes = useModes();
  const toast = useToast();
  // The same gate arms the knobs store, in both directions. That is the
  // only place the flag is ever written, so on a release build an override
  // can only apply to an account this gate has called `admin`.
  useArmKnobs(allowed);

  if (!allowed) return null;

  const cfg = Constants.expoConfig;
  const build =
    cfg?.ios?.buildNumber ??
    (cfg?.android?.versionCode === undefined ? null : String(cfg.android.versionCode));
  const roles = me.data?.roles ?? [];

  const open = (demo: DemoEntry) => {
    if (demo.href === undefined) router.push({ pathname: "/dev/[id]", params: { id: demo.id } });
    // The catalog's hrefs are the app's own routes; typed routes cannot see
    // through the catalog's `string`, so the cast stops here.
    else router.push(demo.href as Href);
  };

  return (
    <>
      <Stack.Screen options={{ title: DEV_STRINGS.title }} />
      <Screen testID="developer-screen">
        <Card index={0}>
          <Row label={DEV_STRINGS.api} value={apiUrl()} />
          <Row label={DEV_STRINGS.account} value={me.data?.user.email ?? DEV_STRINGS.signedOut} />
          <Row
            label={DEV_STRINGS.roles}
            value={roles.length > 0 ? roles.join(", ") : DEV_STRINGS.noRoles}
          />
          <Row label={DEV_STRINGS.version} value={cfg?.version ?? DEV_STRINGS.buildUnknown} />
          <Row label={DEV_STRINGS.build} value={build ?? DEV_STRINGS.buildUnknown} />
        </Card>

        <Card index={1}>
          <SwitchRow
            label={DEV_STRINGS.reduceMotion}
            hint={DEV_STRINGS.reduceMotionHint}
            value={motion.reduced}
            onValueChange={(v) => prefs.setMotion(v)}
            testID="dev-motion"
          />
          <SwitchRow
            label={DEV_STRINGS.quietMode}
            hint={DEV_STRINGS.quietModeHint}
            value={modes.quiet === true}
            onValueChange={(v) => modes.setQuiet(v ? true : null)}
            testID="dev-quiet"
          />
        </Card>

        <Card index={2} className="gap-3">
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={DEV_STRINGS.knobs.row}
            onPress={() => router.push("/dev/knobs")}
            className="min-h-12 justify-center rounded-2xl bg-sand-deep px-4 py-3"
            testID="dev-knobs-row"
          >
            <Text className="font-body-semibold text-base text-ink">{DEV_STRINGS.knobs.row}</Text>
            <Text className="font-body text-xs text-mist">{DEV_STRINGS.knobs.rowHint}</Text>
          </Pressable>
          <Button
            label={DEV_STRINGS.clearGuest}
            variant="cloud"
            full
            onPress={() => {
              void clearGuest().then(() => {
                qc.removeQueries({ queryKey: ["guest"] });
                toast.show(DEV_STRINGS.clearGuestDone, "sea");
                return null;
              });
            }}
            testID="dev-clear-guest"
          />
          <Button
            label={DEV_STRINGS.clearOnboarding}
            variant="cloud"
            full
            onPress={() => {
              void resetOnboarding().then(() => {
                toast.show(DEV_STRINGS.clearOnboardingDone, "sea");
                return null;
              });
            }}
            testID="dev-clear-onboarding"
          />
          <Button
            label={DEV_STRINGS.signOut}
            variant="coral"
            full
            disabled={!me.data}
            onPress={() => void signOut()}
            testID="dev-sign-out"
          />
        </Card>

        <Text className="mt-2 font-display text-lg text-indigo">{DEV_STRINGS.gallery}</Text>
        <Text className="-mt-2 font-body text-sm text-mist">{DEV_STRINGS.galleryHint}</Text>

        {groupedDemos().map((group) => (
          <View key={group.group} className="gap-2">
            <Text className="font-body-bold text-xs uppercase tracking-wide text-mist">
              {group.title}
            </Text>
            {group.demos.map((demo) => (
              <Pressable
                key={demo.id}
                accessibilityRole="button"
                accessibilityLabel={demo.title}
                onPress={() => open(demo)}
                className="min-h-12 rounded-2xl bg-cloud px-4 py-3"
                testID={`demo-${demo.id}`}
              >
                <Text className="font-body-semibold text-base text-ink">{demo.title}</Text>
                <Text className="font-body text-xs text-mist">
                  {demo.href === undefined
                    ? demo.note
                    : `${demo.note} · ${DEV_STRINGS.opensRealScreen}`}
                </Text>
              </Pressable>
            ))}
          </View>
        ))}
      </Screen>
    </>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <View className="flex-row items-baseline gap-3 py-0.5">
      <Text className="w-20 font-body-semibold text-sm text-mist">{label}</Text>
      <Text className="flex-1 font-body text-sm text-ink" numberOfLines={2}>
        {value}
      </Text>
    </View>
  );
}

function SwitchRow({
  label,
  hint,
  value,
  onValueChange,
  testID,
}: {
  label: string;
  hint: string;
  value: boolean;
  onValueChange: (v: boolean) => void;
  testID: string;
}) {
  return (
    <View className="min-h-11 flex-row items-center justify-between gap-3 py-1">
      <View className="flex-1">
        <Text className="font-body-semibold text-base text-ink">{label}</Text>
        <Text className="font-body text-sm text-mist">{hint}</Text>
      </View>
      <Switch label={label} value={value} onValueChange={onValueChange} testID={testID} />
    </View>
  );
}
