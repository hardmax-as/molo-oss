import { useAudioPlayer, useAudioPlayerStatus } from "expo-audio";
import { useEffect, useImperativeHandle, useMemo, useRef, useState, type Ref } from "react";
import { Pressable, Text, View } from "react-native";
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withRepeat,
  withSequence,
  withTiming,
} from "react-native-reanimated";
import Svg, { Line, Path } from "react-native-svg";

import { warmedUri } from "~/lib/audio-cache.ts";
import { useT } from "~/lib/i18n.tsx";
import { usePrivateAudioSource } from "~/lib/private-audio.ts";
import { useMotion } from "~/ui/motion.ts";
import { useSfx } from "~/ui/sfx.tsx";
import { colors, timing } from "~/ui/theme.ts";

const EDGE = 3;

/** What a parent can do with an `AudioButton` through `controlRef`. */
export interface AudioControl {
  play: () => void;
}

/** Controls for a list of tiles, keyed by id: `controlFor(id)` is the button's ref. */
export function useAudioControls() {
  const controls = useRef(new Map<string, AudioControl>());
  const controlFor = (id: string) => (control: AudioControl | null) => {
    if (control) controls.current.set(id, control);
    else controls.current.delete(id);
  };
  return { controls, controlFor };
}

/** One of the three bars that dance while a clip plays. */
function Bar({ i, color, playing }: { i: number; color: string; playing: boolean }) {
  const h = useSharedValue(0.4);
  useEffect(() => {
    if (playing) {
      h.value = withDelay(
        i * 90,
        withRepeat(
          withSequence(withTiming(1, { duration: 220 }), withTiming(0.35, { duration: 260 })),
          -1,
          true,
        ),
      );
    } else {
      h.value = withTiming(0.4, { duration: 120 });
    }
  }, [playing, i, h]);
  const style = useAnimatedStyle(() => ({ transform: [{ scaleY: h.value }] }));
  return (
    <Animated.View
      style={[{ width: 4, height: 18, borderRadius: 2, backgroundColor: color }, style]}
    />
  );
}

function SpeakerIcon({ size, color, off }: { size: number; color: string; off: boolean }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path d="M4 9v6h4l5 4V5L8 9H4z" fill={color} />
      {off ? (
        <>
          <Line
            x1="16"
            y1="9"
            x2="21"
            y2="15"
            stroke={color}
            strokeWidth="2.2"
            strokeLinecap="round"
          />
          <Line
            x1="21"
            y1="9"
            x2="16"
            y2="15"
            stroke={color}
            strokeWidth="2.2"
            strokeLinecap="round"
          />
        </>
      ) : (
        <>
          <Path d="M16 9a4 4 0 0 1 0 6" stroke={color} strokeWidth="2.2" strokeLinecap="round" />
          <Path
            d="M18.5 6.5a7.5 7.5 0 0 1 0 11"
            stroke={color}
            strokeWidth="2.2"
            strokeLinecap="round"
          />
        </>
      )}
    </Svg>
  );
}

/**
 * The audio button (docs/DESIGN.md): a solid circle with the pressable
 * bottom edge, big enough for a thumb. `prompt` is sun with an indigo
 * speaker; `tile` (inside option tiles) is indigo with a sun speaker. Three
 * bars dance while the clip plays, UI sounds stay silent meanwhile, and the
 * Forvo attribution shows when the API says so (CONTENT.md section 3).
 * "No audio yet" is a solid mist circle with a speaker-off icon and a label,
 * never dashed or faded: an honest state, not a broken control.
 */
export function AudioButton({
  url,
  label,
  attribution,
  rate = 1,
  autoPlay = false,
  small = false,
  variant = "prompt",
  cue = false,
  onPlay,
  controlRef,
}: {
  /**
   * Lets a parent play the clip. An answer tile is one accessible button, so
   * VoiceOver cannot reach a play button nested in it; the tile offers a
   * "play" accessibility action that calls this instead (audit M05).
   */
  controlRef?: Ref<AudioControl>;
  url: string | null | undefined;
  label: string;
  attribution?: string | null | undefined;
  rate?: number;
  autoPlay?: boolean;
  small?: boolean;
  variant?: "prompt" | "tile";
  /** Play the `cue` tick before the clip (click drills). */
  cue?: boolean;
  onPlay?: () => void;
}) {
  const t = useT();
  // Editor audio passes a session check per request, so a list of it loads on
  // the first tap rather than all at once (the web review page exhausted the
  // database connections that way on 2026-09-27). Learner audio loads at once.
  const [armed, setArmed] = useState(() => autoPlay || !url?.includes("b=private"));
  const playWhenLoaded = useRef(false);
  // A clip the lesson fetched ahead plays from the device (src/lib/audio-cache.ts).
  // Asked once per URL: a copy that lands after the button mounted is left
  // for the next time, rather than swapping the source under a playing clip.
  const source = useMemo(() => warmedUri(url) ?? url, [url]);
  const player = useAudioPlayer(usePrivateAudioSource(armed ? source : null));
  const status = useAudioPlayerStatus(player);
  const sfx = useSfx();
  const m = useMotion();
  const pressed = useSharedValue(0);
  const ring = useSharedValue(1);
  const played = useRef(false);
  const size = small ? 44 : 56;
  const face =
    variant === "tile"
      ? { bg: colors.indigo, edge: colors.indigoDeep, icon: colors.sun }
      : { bg: colors.sun, edge: colors.sunDeep, icon: colors.indigo };

  useEffect(() => {
    sfx.setClipPlaying(status.playing);
    if (status.playing && !m.reduced) {
      ring.value = withRepeat(
        withSequence(withTiming(1.18, { duration: 320 }), withTiming(1, { duration: 320 })),
        -1,
        false,
      );
    } else {
      ring.value = withTiming(1, { duration: 150 });
    }
    return () => sfx.setClipPlaying(false);
  }, [status.playing, m.reduced, ring, sfx]);

  const ringStyle = useAnimatedStyle(() => ({
    transform: [{ scale: ring.value }],
    opacity: 1.4 - ring.value,
  }));
  const faceStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: pressed.value * EDGE }, { scale: 1 - pressed.value * 0.03 }],
  }));

  const play = () => {
    if (!url) return;
    if (!armed) {
      playWhenLoaded.current = true;
      setArmed(true);
      return;
    }
    if (cue) sfx.play("cue");
    // On iOS `playbackRate` and `shouldCorrectPitch` are getters only:
    // assigning either throws and crashed the app on the first tap of a word
    // (MOLO-MOBILE-4, build 8). The setter method sets both, and a rate the
    // platform refuses must never cost the learner the recording itself.
    try {
      if (player.playbackRate !== rate) player.setPlaybackRate(rate, "high");
    } catch {
      // Play at the normal rate rather than not at all.
    }
    void player.seekTo(0);
    player.play();
    onPlay?.();
  };
  useImperativeHandle(controlRef, () => ({ play }));

  useEffect(() => {
    if (playWhenLoaded.current && status.isLoaded) {
      playWhenLoaded.current = false;
      play();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status.isLoaded]);

  useEffect(() => {
    if (autoPlay && url && status.isLoaded && !played.current) {
      played.current = true;
      const handle = setTimeout(play, cue ? 180 : 0);
      return () => clearTimeout(handle);
    }
    return undefined;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoPlay, url, status.isLoaded]);

  if (!url) {
    return (
      <View className="flex-row items-center gap-2" accessibilityLabel={t("lesson.noAudio")}>
        <View
          style={{
            width: size,
            height: size,
            borderRadius: size / 2,
            backgroundColor: colors.mist,
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <SpeakerIcon size={size * 0.5} color={colors.cloud} off />
        </View>
        {!small && (
          <Text className="font-body-semibold text-xs text-mist">{t("lesson.noAudio")}</Text>
        )}
      </View>
    );
  }
  return (
    <View className="flex-row items-center gap-2">
      <View style={{ width: size, height: size + EDGE }}>
        {status.playing && (
          <Animated.View
            pointerEvents="none"
            style={[
              {
                position: "absolute",
                left: 0,
                top: 0,
                width: size,
                height: size,
                borderRadius: size / 2,
                borderWidth: 3,
                borderColor: face.bg,
              },
              ringStyle,
            ]}
          />
        )}
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={label}
          onPress={play}
          onPressIn={() => {
            pressed.value = withTiming(1, { duration: timing.press });
          }}
          onPressOut={() => {
            pressed.value = withTiming(0, { duration: timing.press });
          }}
          style={{
            width: size,
            height: size + EDGE,
            borderRadius: size / 2,
            backgroundColor: face.edge,
          }}
        >
          <Animated.View
            style={[
              {
                width: size,
                height: size,
                borderRadius: size / 2,
                backgroundColor: face.bg,
                alignItems: "center",
                justifyContent: "center",
              },
              faceStyle,
            ]}
          >
            {status.playing ? (
              <View className="flex-row items-center gap-1">
                <Bar i={0} color={face.icon} playing />
                <Bar i={1} color={face.icon} playing />
                <Bar i={2} color={face.icon} playing />
              </View>
            ) : (
              <SpeakerIcon size={size * 0.52} color={face.icon} off={false} />
            )}
          </Animated.View>
        </Pressable>
      </View>
      {rate !== 1 && <Text className="font-body-semibold text-xs text-mist">{rate}×</Text>}
      {attribution ? <Text className="font-body text-[10px] text-mist">{attribution}</Text> : null}
    </View>
  );
}
