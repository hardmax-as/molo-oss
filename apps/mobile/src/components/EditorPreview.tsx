import {
  previewExerciseContent,
  type PreviewPathResponse,
  type PreviewUnitResponse,
  type Status,
} from "@molo/core";
import { useQuery } from "@tanstack/react-query";
import { useNetworkState } from "expo-network";
import { Redirect, useRouter } from "expo-router";
import { useState } from "react";
import { Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { api } from "~/lib/api.ts";
import { useContentTitle, useLang, useT } from "~/lib/i18n.tsx";
import { usePreview } from "~/lib/use-preview.ts";
import { Button } from "~/ui/Button.tsx";
import { Card } from "~/ui/Card.tsx";
import { Screen } from "~/ui/Screen.tsx";
import { Switch } from "~/ui/Switch.tsx";

import { Exercise } from "./exercises/Runner.tsx";

export function PreviewStatus({ status }: { status: Status }) {
  const t = useT();
  return status === "published" ? null : (
    <Text className="self-start rounded-full bg-sun/40 px-3 py-1 font-body text-sm text-indigo">
      {t(`edit.status.${status}`)}
    </Text>
  );
}

export function PreviewSwitch() {
  const t = useT();
  const preview = usePreview();
  const router = useRouter();
  if (!preview.allowed) return null;
  return (
    <Card>
      <View className="flex-row items-center justify-between gap-3">
        <Text className="font-body-semibold text-base text-indigo">{t("preview.switch")}</Text>
        <Switch
          label={t("preview.switch")}
          value={preview.enabled}
          onValueChange={(enabled) => {
            preview.setEnabled(enabled);
            router.replace(enabled ? "/preview" : "/");
          }}
        />
      </View>
    </Card>
  );
}

export function PreviewBanner() {
  const insets = useSafeAreaInsets();
  const t = useT();
  const preview = usePreview();
  const router = useRouter();
  if (!preview.enabled) return null;
  return (
    <View className="gap-2 bg-sun p-4" style={{ paddingTop: insets.top + 16 }}>
      <Text accessibilityRole="alert" className="font-body-bold text-base text-indigo">
        {t("preview.banner")}
      </Text>
      <Button
        label={t("preview.exit")}
        variant="cloud"
        onPress={() => {
          preview.setEnabled(false);
          router.replace("/");
        }}
      />
    </View>
  );
}

export function EditorPreview() {
  const t = useT();
  const title = useContentTitle();
  const { lang } = useLang();
  const preview = usePreview();
  const network = useNetworkState();
  const online = network.isConnected !== false && network.isInternetReachable !== false;
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
  if (!preview.enabled) return <Redirect href="/" />;
  if (!online)
    return (
      <Screen>
        <Text>{t("preview.connection")}</Text>
      </Screen>
    );
  if (slug) {
    if (unitQuery.isError)
      return (
        <Screen>
          <Text>{t("common.error")}</Text>
        </Screen>
      );
    if (!unitQuery.data)
      return (
        <Screen>
          <Text>{t("common.loading")}</Text>
        </Screen>
      );
    const data = unitQuery.data;
    const selectedLesson = data.unit.skills
      .flatMap((s) => s.lessons)
      .find((l) => l.id === lessonId);
    return (
      <Screen>
        <Button
          label={t("preview.path")}
          variant="cloud"
          onPress={() => {
            setSlug(null);
            setLessonId(null);
          }}
        />
        <Text className="font-display text-3xl text-indigo">
          {title(data.unit.titleKey, data.unit.slug)}
        </Text>
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
              <Text className="mb-3 font-display text-xl text-indigo">
                {title(skill.titleKey, skill.slug)}
              </Text>
              <PreviewStatus status={skill.status} />
              {skill.lessons.map((lesson) => (
                <View key={lesson.id} className="my-3 gap-3">
                  <Button
                    label={t("preview.lesson", { number: lesson.order })}
                    variant="cloud"
                    onPress={() => setLessonId(lesson.id)}
                  />
                  <PreviewStatus status={lesson.status} />
                </View>
              ))}
            </Card>
          ))
        )}
      </Screen>
    );
  }
  if (path.isError)
    return (
      <Screen>
        <Text>{t("common.error")}</Text>
      </Screen>
    );
  if (!path.data)
    return (
      <Screen>
        <Text>{t("common.loading")}</Text>
      </Screen>
    );
  return (
    <Screen>
      <Text className="font-display text-3xl text-indigo">{t("preview.switch")}</Text>
      {!path.data.units.length && <Text>{t("preview.empty")}</Text>}
      {path.data.units.map((unit) => (
        <Card key={unit.id}>
          <Text className="mb-3 font-display text-xl text-indigo">
            {title(unit.titleKey, unit.slug)}
          </Text>
          <PreviewStatus status={unit.status} />
          <View className="mt-3">
            <Button label={t("preview.open")} onPress={() => setSlug(unit.slug)} />
          </View>
        </Card>
      ))}
    </Screen>
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
    <View className="gap-4">
      <View className="gap-3">
        <Text className="font-display text-xl text-indigo">
          {t("preview.lesson", { number: lesson.order })}
        </Text>
        <PreviewStatus status={lesson.status} />
      </View>
      <Button label={t("preview.unit")} variant="cloud" onPress={leave} />
      {exercise && material ? (
        <Card>
          <View className="mb-4 gap-3">
            <Text>{t("preview.exercise", { number: index + 1 })}</Text>
            <PreviewStatus status={exercise.status} />
          </View>
          {material.missingAudio.map((label, i) => (
            <Text key={i} className="mb-3 font-body text-coral-deep">
              {label ? t("preview.missingAudio", { content: label }) : t("lesson.noAudio")}
            </Text>
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
            <Text>{t("preview.missingContent")}</Text>
          )}
          <View className="mt-4">
            <Button
              label={t("preview.next")}
              variant="cloud"
              onPress={() => setIndex((n) => n + 1)}
            />
          </View>
        </Card>
      ) : (
        <Text accessibilityRole="alert">{t("preview.finished")}</Text>
      )}
    </View>
  );
}
