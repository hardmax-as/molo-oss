import { Stack } from "expo-router";

import { useT } from "~/lib/i18n.tsx";
import { stackOptions } from "~/ui/stack-options.ts";

/**
 * Home stays under a unit or lesson opened directly (onboarding's "start
 * your first lesson", a deep link), so the back button leads to the path
 * instead of leaving the stack with nowhere to go.
 */
export const unstable_settings = { initialRouteName: "index" };

/** Learn tab: the unit list, a unit's path and the lesson runner. */
export default function LearnStack() {
  const t = useT();
  return (
    <Stack screenOptions={stackOptions}>
      <Stack.Screen name="index" options={{ title: t("home.greeting") }} />
      {/* The rules a learner has unlocked, reachable at any time
          (docs/GRAMMAR.md section 1). */}
      <Stack.Screen name="grammar" options={{ title: t("grammar.title") }} />
      <Stack.Screen name="learn/[slug]/index" />
      <Stack.Screen
        name="learn/[slug]/[lessonId]"
        options={{ headerShown: false, gestureEnabled: false }}
      />
    </Stack>
  );
}
