import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { Platform, Pressable, Text } from "react-native";
import Animated, { FadeInUp, FadeOutUp } from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { FullWindowOverlay } from "react-native-screens";

import { useAnnounce } from "~/lib/announce.ts";

import { useMotion } from "./motion.ts";

interface Toast {
  id: number;
  message: string;
  tone: "indigo" | "sea" | "coral";
}

interface ToastCtx {
  show: (message: string, tone?: Toast["tone"]) => void;
}

const Ctx = createContext<ToastCtx>({ show: () => undefined });

const SHOW_MS = 3200;

/**
 * One short message at a time, dropped in under the status bar and gone
 * after a few seconds (or a tap). For things that happen away from the
 * screen the learner is looking at: guest lessons saved to a new account,
 * a sign-in provider that is not set up.
 */
export function ToastProvider({ children }: { children: ReactNode }) {
  const [toast, setToast] = useState<Toast | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const show = useCallback((message: string, tone: Toast["tone"] = "indigo") => {
    setToast({ id: Date.now(), message, tone });
  }, []);
  useEffect(() => {
    if (!toast) return;
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setToast(null), SHOW_MS);
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
  }, [toast]);
  const value = useMemo(() => ({ show }), [show]);
  return (
    <Ctx.Provider value={value}>
      {children}
      {toast && <ToastPill toast={toast} onDismiss={() => setToast(null)} />}
    </Ctx.Provider>
  );
}

/**
 * On iOS the sign-in and Plus sheets are native modals above the root view,
 * so the pill goes in react-native-screens' full-window overlay (empty areas
 * pass touches through); elsewhere an absolute view over the root is enough.
 */
function ToastPill({ toast, onDismiss }: { toast: Toast; onDismiss: () => void }) {
  const insets = useSafeAreaInsets();
  const m = useMotion();
  // The live region below is Android's; this is the same message on iOS.
  useAnnounce(toast.message);
  const bg =
    toast.tone === "sea" ? "bg-sea-deep" : toast.tone === "coral" ? "bg-coral-deep" : "bg-indigo";
  const pill = (
    <Animated.View
      key={toast.id}
      entering={FadeInUp.duration(m.enter)}
      exiting={FadeOutUp.duration(160)}
      pointerEvents="box-none"
      style={{
        position: "absolute",
        top: insets.top + 8,
        left: 16,
        right: 16,
        alignItems: "center",
        zIndex: 50,
      }}
    >
      <Pressable
        accessibilityRole="alert"
        accessibilityLiveRegion="polite"
        onPress={onDismiss}
        className={`rounded-full px-5 py-3 ${bg}`}
        style={{ shadowColor: "#000", shadowOpacity: 0.18, shadowRadius: 12, elevation: 6 }}
        testID="toast"
      >
        <Text className="font-body-bold text-base text-cloud">{toast.message}</Text>
      </Pressable>
    </Animated.View>
  );
  return Platform.OS === "ios" ? <FullWindowOverlay>{pill}</FullWindowOverlay> : pill;
}

export function useToast(): ToastCtx {
  return useContext(Ctx);
}
