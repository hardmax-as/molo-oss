import type { AnyRouter } from "@tanstack/react-router";

/**
 * Browser-side Sentry (STACK.md: Sentry on Workers, web, mobile). Loaded
 * lazily so the SDK never enters the SSR bundle, and a no-op without
 * VITE_SENTRY_DSN. Route changes become transactions through the TanStack
 * Router integration.
 */
let started = false;

export async function startSentry(router: AnyRouter): Promise<void> {
  const dsn = import.meta.env["VITE_SENTRY_DSN"] as string | undefined;
  if (!dsn || started || typeof window === "undefined") return;
  started = true;
  const Sentry = await import("@sentry/tanstackstart-react");
  Sentry.init({
    dsn,
    release: import.meta.env["VITE_SENTRY_RELEASE"] as string | undefined,
    environment: import.meta.env.MODE,
    integrations: [Sentry.tanstackRouterBrowserTracingIntegration(router)],
    tracesSampleRate: import.meta.env.PROD ? 0.2 : 1,
    sendDefaultPii: false,
  });
}
