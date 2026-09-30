/**
 * The push-reminder lifecycle as decisions over injected ports, so Jest
 * covers it without expo-notifications or a device. `src/lib/push-ports.ts`
 * wires the real ports; nothing here imports a native module.
 *
 * The chains are written with `.then` rather than `async`/`await` on
 * purpose: `@babel/runtime` is not resolvable from apps/mobile under Bun's
 * isolated layout, so an `async` function in a module the Jest suite imports
 * fails to load (the library notes).
 */

export type PushPermission = "granted" | "denied" | "undetermined";
export type PushPlatform = "ios" | "android";

export interface PushRegistration {
  readonly token: string;
  readonly platform: PushPlatform;
  readonly appVersion?: string;
}

export interface PushPorts {
  /**
   * False on a simulator and on web: Expo issues push tokens to real devices
   * only, so the Settings toggle explains itself instead of failing.
   */
  readonly isDevice: boolean;
  readonly platform: PushPlatform;
  readonly appVersion: string | null;
  readonly getPermission: () => Promise<PushPermission>;
  readonly requestPermission: () => Promise<PushPermission>;
  /** The Expo push token, or null when the build has no push credentials. */
  readonly getToken: () => Promise<string | null>;
  readonly register: (registration: PushRegistration) => Promise<void>;
  readonly unregister: (token: string | null) => Promise<void>;
  /** Android wants the notification channel to exist before the first push. */
  readonly prepareChannel?: () => Promise<void>;
}

export interface PushState {
  /** A real device on a platform Expo pushes to. */
  readonly supported: boolean;
  readonly permission: PushPermission;
  /** The token this device is registered with, or null when it is not registered. */
  readonly token: string | null;
}

export const PUSH_UNSUPPORTED: PushState = {
  supported: false,
  permission: "undetermined",
  token: null,
};

export function pushPlatform(os: string): PushPlatform | null {
  return os === "ios" || os === "android" ? os : null;
}

function registerToken(ports: PushPorts): Promise<string | null> {
  return Promise.resolve(ports.prepareChannel?.())
    .then(() => ports.getToken())
    .then((token) => {
      if (!token) return null;
      return ports
        .register({
          token,
          platform: ports.platform,
          ...(ports.appVersion ? { appVersion: ports.appVersion } : {}),
        })
        .then(() => token);
    });
}

function registered(ports: PushPorts, permission: PushPermission): Promise<PushState> {
  if (permission !== "granted")
    return Promise.resolve({ supported: true, permission, token: null });
  return registerToken(ports).then((token) => ({ supported: true, permission, token }));
}

/**
 * App start with a session: refresh the token so a reinstall or an OS token
 * rotation does not leave the device silently unreachable. Never prompts —
 * permission is asked from Settings, where the learner can see what for.
 */
export function syncPush(ports: PushPorts): Promise<PushState> {
  if (!ports.isDevice) return Promise.resolve(PUSH_UNSUPPORTED);
  return ports.getPermission().then((permission) => registered(ports, permission));
}

/** The Settings toggle going on: ask for permission, then register this device. */
export function enablePush(ports: PushPorts): Promise<PushState> {
  if (!ports.isDevice) return Promise.resolve(PUSH_UNSUPPORTED);
  return ports
    .getPermission()
    .then((permission) => (permission === "granted" ? permission : ports.requestPermission()))
    .then((permission) => registered(ports, permission));
}

/**
 * The toggle going off, and sign-out: the server forgets this device. The OS
 * permission is left alone — only the person can withdraw that, in Settings.
 */
export function disablePush(ports: PushPorts, state: PushState): Promise<PushState> {
  if (!state.token) return Promise.resolve(state);
  return ports.unregister(state.token).then(() => ({ ...state, token: null }));
}

export type PushNote = "simulator" | "denied" | "failed" | null;

/** What the Settings row shows: the switch position and the note under it. */
export function pushToggle(state: PushState, failed = false): { on: boolean; note: PushNote } {
  if (!state.supported) return { on: false, note: "simulator" };
  if (state.permission === "denied") return { on: false, note: "denied" };
  if (failed) return { on: false, note: "failed" };
  return { on: state.token !== null, note: null };
}

/**
 * Where a tapped notification goes. The server suggests a route; the app
 * follows only routes it knows, so a payload can never navigate anywhere.
 */
const PUSH_ROUTES: Record<string, "/review"> = {
  "/review": "/review",
  review: "/review",
};

export function routeFromNotification(data: unknown): "/review" | null {
  const route = (data as { route?: unknown } | null | undefined)?.route;
  return typeof route === "string" ? (PUSH_ROUTES[route] ?? null) : null;
}
