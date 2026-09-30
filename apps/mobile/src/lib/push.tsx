import * as Notifications from "expo-notifications";
import { router } from "expo-router";
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

import { accountReady } from "./age-step.ts";
import {
  disablePush,
  enablePush,
  pushToggle,
  routeFromNotification,
  syncPush,
  PUSH_UNSUPPORTED,
  type PushNote,
  type PushState,
} from "./push-logic.ts";
import { pushPorts } from "./push-ports.ts";
import { useMe } from "./session.tsx";

/**
 * Streak reminders on this device. Permission is asked from Settings behind
 * the toggle, never at first launch: the learner sees what the notification
 * is for before the system sheet appears. The token is registered with the
 * API on grant and refreshed on every start with a session; sign-out
 * withdraws it (src/lib/push-ports.ts).
 */

interface PushContext {
  readonly state: PushState;
  /** Switch position and the note under it, ready for the Settings row. */
  readonly toggle: { on: boolean; note: PushNote };
  readonly busy: boolean;
  readonly setEnabled: (on: boolean) => void;
}

const initial: PushState = { supported: true, permission: "undetermined", token: null };

const Ctx = createContext<PushContext>({
  state: PUSH_UNSUPPORTED,
  toggle: { on: false, note: "simulator" },
  busy: false,
  setEnabled: () => undefined,
});

export function PushProvider({ children }: { children: ReactNode }) {
  const me = useMe();
  const [state, setState] = useState<PushState>(initial);
  const [failed, setFailed] = useState(false);
  const [busy, setBusy] = useState(false);
  // A one-tap account registers no device until it is past the age step.
  const signedIn = accountReady(me.data);
  const stateRef = useRef(state);
  stateRef.current = state;

  // A session and a permission already granted: refresh the token, silently.
  useEffect(() => {
    if (!signedIn) {
      setState(initial);
      return;
    }
    let cancelled = false;
    syncPush(pushPorts)
      .then((refreshed) => {
        if (!cancelled) setState(refreshed);
        return null;
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [signedIn]);

  const setEnabled = useCallback((on: boolean) => {
    setBusy(true);
    setFailed(false);
    const run = on ? enablePush(pushPorts) : disablePush(pushPorts, stateRef.current);
    run
      .then((result) => {
        setState(result);
        // Permission granted but no token: no push credentials for this build.
        if (on && result.supported && result.permission === "granted" && !result.token) {
          setFailed(true);
        }
        return null;
      })
      .catch(() => setFailed(true))
      .finally(() => setBusy(false));
  }, []);

  const value = useMemo<PushContext>(
    () => ({ state, toggle: pushToggle(state, failed), busy, setEnabled }),
    [state, failed, busy, setEnabled],
  );
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function usePush(): PushContext {
  return useContext(Ctx);
}

/**
 * A tapped reminder opens the review tab. The cold start (the response that
 * launched the app) and taps while it runs go through the same allowlist, so
 * a payload can only reach a route the app already knows.
 */
export function usePushDeepLink(): void {
  useEffect(() => {
    const go = (response: Notifications.NotificationResponse | null) => {
      const route = routeFromNotification(response?.notification.request.content.data);
      if (route) router.navigate(route);
    };
    go(Notifications.getLastNotificationResponse());
    Notifications.clearLastNotificationResponse();
    const sub = Notifications.addNotificationResponseReceivedListener(go);
    return () => sub.remove();
  }, []);
}
