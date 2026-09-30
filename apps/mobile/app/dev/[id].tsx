import { Stack, useLocalSearchParams, useRouter } from "expo-router";
import { Pressable, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { useDevAccess } from "~/dev/access.ts";
import { demoById, type ViewDemoId } from "~/dev/catalog.ts";
import { DEV_STRINGS } from "~/dev/strings.ts";
import { DEMO_VIEWS } from "~/dev/views.tsx";

/**
 * One demo, full screen, with a way back. The view is the app's own
 * component with fabricated props; this screen only decides the ground it
 * stands on — sand for most, the indigo night sky for the celebration beats,
 * which is what the lesson screen itself turns into when the last exercise
 * is answered.
 */
export default function DemoScreen() {
  const allowed = useDevAccess();
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const entry = id === undefined ? undefined : demoById(id);
  const view = entry && entry.href === undefined ? DEMO_VIEWS[entry.id as ViewDemoId] : undefined;

  if (!allowed || !entry || !view) return null;
  const { Component, tone, bleed } = view;
  const ground = tone === "indigo" ? "bg-indigo" : "bg-sand";

  // A full-bleed demo owns the whole screen, so it loses the stack header and
  // gets its own way out instead.
  if (bleed === true)
    return (
      <SafeAreaView className={`flex-1 ${ground}`} edges={["top", "bottom"]}>
        <Stack.Screen options={{ headerShown: false }} />
        <Component />
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={DEV_STRINGS.back}
          onPress={() => router.back()}
          className="absolute left-3 top-3 min-h-11 justify-center rounded-full bg-cloud px-4"
          style={{ zIndex: 100 }}
          testID="demo-back"
        >
          <Text className="font-body-bold text-base text-indigo">{DEV_STRINGS.back}</Text>
        </Pressable>
      </SafeAreaView>
    );

  return (
    <View className={`flex-1 ${ground}`}>
      <Stack.Screen options={{ title: entry.title, headerLargeTitle: false }} />
      <Component />
    </View>
  );
}
