import { studioUnitOptions, type AudioQueueItem } from "@molo/core";
import { useQuery } from "@tanstack/react-query";
import {
  RecordingPresets,
  requestRecordingPermissionsAsync,
  setAudioModeAsync,
  useAudioPlayer,
  useAudioPlayerStatus,
  useAudioRecorder,
  useAudioRecorderState,
} from "expo-audio";
import { File } from "expo-file-system";
import { Redirect, useFocusEffect } from "expo-router";
import { useCallback, useEffect, useRef, useState } from "react";
import { AppState, Text, View } from "react-native";

import { useEditorConnection } from "~/components/EditorConnection.tsx";
import { canReview } from "~/lib/editor-access.ts";
import { useContentTitle, useLang, useT } from "~/lib/i18n.tsx";
import { useMe } from "~/lib/session.tsx";
import {
  CLICKS_SELECTION,
  EDITOR_STUDIO_KEY,
  getStudioQueue,
  getStudioSpeakers,
  uploadStudioTake,
} from "~/lib/studio-api.ts";
import {
  cachedStudioSession,
  loadStudioSession,
  saveStudioSession,
} from "~/lib/studio-session-store.ts";
import {
  EMPTY_STUDIO_SESSION,
  itemKey,
  markRecorded,
  moveBy,
  positionOf,
  remainingItems,
  takeMatches,
  type StudioSessionState,
} from "~/lib/studio-session.ts";
import { Button } from "~/ui/Button.tsx";
import { Card } from "~/ui/Card.tsx";
import { MenuSelect } from "~/ui/MenuSelect.tsx";
import { Screen } from "~/ui/Screen.tsx";

/** A bare click's variant, named in the UI language (the letter is the prompt). */
const CLICK_VARIANT_LABEL = {
  plain: "edit.studio.clickVariant.plain",
  aspirated: "edit.studio.clickVariant.aspirated",
  nasal: "edit.studio.clickVariant.nasal",
  voiced: "edit.studio.clickVariant.voiced",
  voiced_nasal: "edit.studio.clickVariant.voiced_nasal",
} as const;

type UpdateSession = (next: (previous: StudioSessionState) => StudioSessionState) => void;

/**
 * Mount no editorial data or recorder until both the session and connection
 * are available. Auto-lock, backgrounding and a dropped connection unmount
 * everything below, so the session's place lives in `studio-session-store`
 * and comes back on return (audit M01). Only a take held in memory is lost.
 */
export function Studio() {
  const [focused, setFocused] = useState(false);
  const [foreground, setForeground] = useState(AppState.currentState !== "background");
  useFocusEffect(
    useCallback(() => {
      setFocused(true);
      return () => setFocused(false);
    }, []),
  );
  useEffect(() => {
    const subscription = AppState.addEventListener("change", (state) => {
      // iOS permission dialogs are inactive; preserve the session until the app leaves.
      if (state === "background") setForeground(false);
      else if (state === "active") setForeground(true);
    });
    return () => subscription.remove();
  }, []);
  const me = useMe();
  const online = useEditorConnection();
  const t = useT();
  if (me.isPending)
    return (
      <Screen>
        <Text>{t("common.loading")}</Text>
      </Screen>
    );
  if (!canReview(me.data)) return <Redirect href="/" />;
  if (!online)
    return (
      <Screen>
        <Text accessibilityRole="alert" className="font-body text-ink">
          {t("edit.mobile.needsConnection")}
        </Text>
        <Text className="font-body text-mist">{t("edit.phoneStudio.kept")}</Text>
        <Button label={t("common.retry")} onPress={() => void me.refetch()} />
      </Screen>
    );
  if (!focused || !foreground) return null;
  return <StudioSetup key={me.data!.user.id} actorId={me.data!.user.id} />;
}

/** A failed load says so and offers a retry; it must never read as "nothing left" (audit W06). */
function LoadFailed({ retry }: { retry: () => void }) {
  const t = useT();
  return (
    <Screen>
      <Text accessibilityRole="alert" className="font-body text-ink">
        {t("edit.studio.loadFailed")}
      </Text>
      <Button label={t("common.retry")} onPress={retry} />
    </Screen>
  );
}

/** The saved session: synchronous when this runtime already holds it, else read from the device. */
function useStudioSession(actorId: string) {
  const [state, setState] = useState<StudioSessionState | null>(() => cachedStudioSession(actorId));
  useEffect(() => {
    if (state) return;
    let live = true;
    void loadStudioSession(actorId).then((saved) => {
      if (live) setState(saved ?? EMPTY_STUDIO_SESSION);
      return null;
    });
    return () => {
      live = false;
    };
  }, [actorId, state]);
  const update = useCallback<UpdateSession>(
    (next) => {
      setState((previous) => {
        const value = next(previous ?? EMPTY_STUDIO_SESSION);
        void saveStudioSession(actorId, value);
        return value;
      });
    },
    [actorId],
  );
  return [state, update] as const;
}

function StudioSetup({ actorId }: { actorId: string }) {
  const t = useT();
  const title = useContentTitle();
  const [session, update] = useStudioSession(actorId);
  const speakerId = session?.speakerId ?? "";
  const unit = session?.unit ?? "";
  const speakers = useQuery({
    queryKey: [EDITOR_STUDIO_KEY, actorId, "speakers"],
    queryFn: ({ signal }) => getStudioSpeakers(signal),
    gcTime: 0,
    retry: false,
  });
  const speaker = speakers.data?.find((entry) => entry.id === speakerId);
  // A restored session whose speaker has lost consent (or gone) falls back to setup.
  const started = (session?.started ?? false) && (speakers.isPending || !!speaker);
  // The unfiltered queue supplies the unit choices; the session requests the selected unit.
  const queue = useQuery({
    queryKey: [EDITOR_STUDIO_KEY, actorId, "units", speakerId],
    queryFn: ({ signal }) => getStudioQueue(speakerId, undefined, signal),
    enabled: !!speakerId && !started,
    gcTime: 0,
    retry: false,
  });
  if (speakers.isError || (!started && queue.isError))
    return (
      <LoadFailed
        retry={() => {
          void speakers.refetch();
          if (speakerId) void queue.refetch();
        }}
      />
    );
  if (!session || speakers.isPending)
    return (
      <Screen>
        <Text>{t("common.loading")}</Text>
      </Screen>
    );
  if (started && speaker)
    return (
      <StudioSession
        actorId={actorId}
        session={session}
        update={update}
        leave={() =>
          update((previous) => ({
            ...EMPTY_STUDIO_SESSION,
            speakerId: previous.speakerId,
            unit: previous.unit,
          }))
        }
      />
    );
  // Course order, numbered as the path numbers them; the superseded unit-1 last, marked old.
  const units = studioUnitOptions(
    queue.data?.items.flatMap((item) => item.unitSlugs) ?? [],
    queue.data?.units,
  );
  return (
    // The stack header already says "Studio"; a second title here doubled it (MOL-67).
    <Screen>
      <Text className="font-body text-mist">{t("edit.phoneStudio.intro")}</Text>
      {speakers.data?.length ? (
        <MenuSelect
          label={t("edit.recorder.speaker")}
          selected={speakerId}
          options={[
            { value: "", label: t("edit.studio.speakerFirst") },
            ...speakers.data.map((s) => ({ value: s.id, label: s.displayName })),
          ]}
          onChange={(id) => update(() => ({ ...EMPTY_STUDIO_SESSION, speakerId: id }))}
        />
      ) : (
        <Text>{t("edit.phoneStudio.noSpeakers")}</Text>
      )}
      {speaker && (
        <>
          <MenuSelect
            label={t("edit.phoneStudio.unit")}
            selected={unit}
            options={[
              { value: "", label: t("edit.phoneStudio.allUnits") },
              ...units.map((u) => {
                const name = title(u.titleKey ?? "", u.slug);
                return {
                  value: u.slug,
                  label:
                    u.number !== null
                      ? t("edit.studio.unitNumbered", { number: u.number, title: name })
                      : t("edit.studio.unitOld", { title: name }),
                };
              }),
              { value: CLICKS_SELECTION, label: t("edit.studio.kind.click") },
            ]}
            onChange={(next) =>
              update((previous) => ({
                ...EMPTY_STUDIO_SESSION,
                speakerId: previous.speakerId,
                unit: next,
              }))
            }
          />
          <Button
            label={t("edit.phoneStudio.startSession")}
            disabled={queue.isPending}
            onPress={() => update((previous) => ({ ...previous, started: true }))}
          />
        </>
      )}
    </Screen>
  );
}

function StudioSession({
  actorId,
  session,
  update,
  leave,
}: {
  actorId: string;
  session: StudioSessionState;
  update: UpdateSession;
  leave: () => void;
}) {
  const t = useT();
  const [jobId, setJobId] = useState<string | null>(null);
  const { speakerId, unit } = session;
  const queue = useQuery({
    queryKey: [EDITOR_STUDIO_KEY, actorId, "queue", speakerId, unit],
    queryFn: ({ signal }) => getStudioQueue(speakerId, unit || undefined, signal),
    gcTime: 0,
    retry: false,
    refetchOnWindowFocus: false,
  });
  if (queue.isError) return <LoadFailed retry={() => void queue.refetch()} />;
  const items = remainingItems(queue.data?.items ?? [], session);
  const here = positionOf(items, session);
  const current = here === -1 ? undefined : items[here];
  return (
    <Screen>
      {jobId && (
        <Text accessibilityRole="alert" className="font-body text-sea-deep">
          {t("edit.phoneStudio.queued", { id: jobId })}
        </Text>
      )}
      {queue.isPending ? (
        <Text>{t("common.loading")}</Text>
      ) : current ? (
        <>
          <Text className="font-body-semibold text-sm text-mist" testID="studio-position">
            {t("edit.studio.position", { index: here + 1, total: items.length })}
            {session.recorded.length > 0
              ? ` · ${t("edit.studio.done", { count: session.recorded.length })}`
              : ""}
          </Text>
          <StudioTake
            // Keyed by item: any move unmounts the take, which discards it.
            key={itemKey(current)}
            item={current}
            speakerId={speakerId}
            canBack={here > 0}
            canSkip={here < items.length - 1}
            onMove={(delta) => update((previous) => moveBy(items, previous, delta))}
            onAccepted={(id) => {
              // Advance only after the server acknowledges the queue job, never optimistically.
              setJobId(id);
              update((previous) => markRecorded(items, previous, itemKey(current)));
            }}
          />
        </>
      ) : (
        <Text className="font-body text-indigo">{t("edit.studio.nothing")}</Text>
      )}
      <Button label={t("edit.phoneStudio.endSession")} variant="ghost" onPress={leave} />
    </Screen>
  );
}

function discardTake(uri: string | null) {
  if (!uri) return;
  try {
    new File(uri).delete();
  } catch {
    /* Already removed by the native cache or recorder. */
  }
}

function StudioTake({
  item,
  speakerId,
  canBack,
  canSkip,
  onMove,
  onAccepted,
}: {
  item: AudioQueueItem;
  speakerId: string;
  canBack: boolean;
  canSkip: boolean;
  onMove: (delta: 1 | -1) => void;
  onAccepted: (jobId: string) => void;
}) {
  const t = useT();
  const { lang } = useLang();
  const recorder = useAudioRecorder(RecordingPresets.HIGH_QUALITY);
  const rec = useAudioRecorderState(recorder, 200);
  const [uri, setUri] = useState<string | null>(null);
  const takeRef = useRef<string | null>(null);
  // Which item the take on hand was recorded for; the upload refuses any other.
  const takeFor = useRef<string | null>(null);
  const player = useAudioPlayer();
  useEffect(() => {
    // The types allow null, but iOS cannot cast it to a source and the whole app dies (MOL-67).
    if (uri) player.replace(uri);
  }, [player, uri]);
  const playback = useAudioPlayerStatus(player);
  const [busy, setBusy] = useState(false);
  const [denied, setDenied] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const mounted = useRef(true);
  // Set synchronously before any await, so a double tap cannot record or upload twice.
  const working = useRef(false);
  const uploadAbort = useRef<AbortController | null>(null);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      uploadAbort.current?.abort();
      try {
        player.pause();
      } catch {
        /* Player may already be released. */
      }
      // The recorder hook releases native resources; restore the playback audio session too.
      void (async () => {
        try {
          if (recorder.isRecording) await recorder.stop();
        } catch {
          /* Hook may have released it. */
        }
        await setAudioModeAsync({ playsInSilentMode: true, allowsRecording: false }).catch(
          () => undefined,
        );
        discardTake(takeRef.current);
      })();
    };
  }, [recorder, player]);

  async function run(action: () => Promise<void>) {
    if (working.current) return;
    working.current = true;
    setBusy(true);
    setError(null);
    try {
      await action();
    } catch (e) {
      await setAudioModeAsync({ allowsRecording: false }).catch(() => undefined);
      if (mounted.current)
        setError(
          e instanceof Error && e.message === "take_mismatch"
            ? t("edit.studio.takeMismatch")
            : t("edit.phoneStudio.failed"),
        );
    } finally {
      working.current = false;
      if (mounted.current) setBusy(false);
    }
  }

  async function start() {
    const permission = await requestRecordingPermissionsAsync();
    if (!mounted.current) return;
    if (!permission.granted) {
      setDenied(true);
      return;
    }
    setDenied(false);
    player.pause();
    discardTake(takeRef.current);
    takeRef.current = null;
    takeFor.current = null;
    setUri(null);
    await setAudioModeAsync({ playsInSilentMode: true, allowsRecording: true });
    if (!mounted.current) {
      await setAudioModeAsync({ allowsRecording: false });
      return;
    }
    await recorder.prepareToRecordAsync();
    if (mounted.current) {
      takeFor.current = itemKey(item);
      recorder.record();
    } else await setAudioModeAsync({ allowsRecording: false });
  }

  async function stop() {
    await recorder.stop();
    await setAudioModeAsync({ playsInSilentMode: true, allowsRecording: false });
    const recorded = recorder.uri;
    if (!mounted.current) {
      discardTake(recorded);
      return;
    }
    if (!recorded) throw new Error("recording_missing");
    takeRef.current = recorded;
    setUri(recorded);
  }

  async function upload() {
    if (!uri) return;
    if (!takeMatches(takeFor.current, item)) throw new Error("take_mismatch");
    player.pause();
    uploadAbort.current = new AbortController();
    const queued = await uploadStudioTake(item, speakerId, uri, uploadAbort.current.signal);
    if (mounted.current) onAccepted(queued.jobId);
  }

  return (
    <Card>
      <View className="gap-4">
        <Text className="font-display text-4xl text-indigo" accessibilityLanguage="xh">
          {item.text}
        </Text>
        {item.click && (
          <Text className="font-body text-base text-mist">
            {t("edit.studio.clickMeaning", {
              base: item.click.base,
              variant: t(CLICK_VARIANT_LABEL[item.click.variant]),
            })}
          </Text>
        )}
        {item.kind === "click" && (
          <Text className="font-body text-sm text-mist">{t("edit.studio.clickHint")}</Text>
        )}
        {item.gloss[lang] && (
          <Text className="font-body text-base text-mist">{item.gloss[lang]}</Text>
        )}
        <Text className="font-body text-sm text-mist">{t("edit.phoneStudio.microphone")}</Text>
        {denied && (
          <Text accessibilityRole="alert" className="font-body text-coral-deep">
            {t("edit.phoneStudio.micDenied")}
          </Text>
        )}
        {error && (
          <Text accessibilityRole="alert" className="font-body text-coral-deep">
            {error}
          </Text>
        )}
        {rec.isRecording ? (
          <Button
            label={t("edit.phoneStudio.stop")}
            disabled={busy}
            onPress={() => void run(stop)}
          />
        ) : (
          <Button
            label={t(uri ? "edit.phoneStudio.rerecord" : "edit.phoneStudio.record")}
            disabled={busy}
            onPress={() => void run(start)}
          />
        )}
        {uri && !rec.isRecording && (
          <>
            <Button
              label={t(playback.playing ? "edit.phoneStudio.pause" : "edit.phoneStudio.play")}
              variant="cloud"
              disabled={busy}
              onPress={() =>
                void run(async () => {
                  if (playback.playing) player.pause();
                  else {
                    await player.seekTo(0);
                    player.play();
                  }
                })
              }
            />
            <Button
              label={t(busy ? "common.loading" : "edit.phoneStudio.upload")}
              disabled={busy}
              onPress={() => void run(upload)}
              testID="studio-upload"
            />
          </>
        )}
        <View className="flex-row justify-between gap-3">
          <Button
            label={t("edit.studio.previous")}
            variant="ghost"
            disabled={busy || !canBack}
            onPress={() => onMove(-1)}
            testID="studio-back"
          />
          <Button
            label={t("edit.studio.skip")}
            variant="ghost"
            disabled={busy || !canSkip}
            onPress={() => onMove(1)}
            testID="studio-skip"
          />
        </View>
      </View>
    </Card>
  );
}
