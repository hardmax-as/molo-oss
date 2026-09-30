import * as Sentry from "@sentry/react-native";

/**
 * Sentry for the learner app (STACK.md). A DSN comes from
 * EXPO_PUBLIC_SENTRY_DSN at build time; without one the SDK is initialised
 * disabled so every call is a no-op and nothing leaves the device.
 */
const dsn = process.env["EXPO_PUBLIC_SENTRY_DSN"];

export function initSentry(): void {
  Sentry.init({
    dsn: dsn ?? undefined,
    enabled: !!dsn,
    environment: __DEV__ ? "local" : "prod",
    tracesSampleRate: __DEV__ ? 1 : 0.1,
    sendDefaultPii: false,
  });
}

export const wrapWithSentry = Sentry.wrap;
export const captureException = (e: unknown) => {
  if (dsn) Sentry.captureException(e);
};
