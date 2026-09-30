/**
 * "A new version is out": the editor pages compare the build they were loaded
 * from with the one the server now serves, and offer a refresh.
 *
 * Every build is stamped with one id (the release SHA on a deploy), baked into
 * the bundle as `VITE_MOLO_BUILD` and written next to it as `/build.json`
 * (vite.config.ts). The check is one tiny uncached GET every few minutes and
 * when the tab comes back into view; the service worker passes `.json`
 * straight through (public/sw.js), so it never answers from a cache. A dev
 * server writes no `/build.json`, so the banner never shows there.
 */
import { useEffect, useState } from "react";

/** The build this page was loaded from. */
export const LOADED_BUILD: string = import.meta.env["VITE_MOLO_BUILD"] ?? "";
export const BUILD_FILE = "/build.json";
/** Cheap enough to be invisible, soon enough to matter in a tutor session. */
export const BUILD_POLL_MS = 5 * 60 * 1000;

/** The served build id from a `/build.json` body, or null when it is not one. */
export function servedBuild(body: unknown): string | null {
  if (!body || typeof body !== "object") return null;
  const build = (body as { build?: unknown }).build;
  return typeof build === "string" && build.trim() ? build.trim() : null;
}

/** Whether the server has moved on: a different id, never a missing or unreadable one. */
export function isNewerBuild(loaded: string, served: string | null): boolean {
  return !!loaded && !!served && served !== loaded;
}

async function fetchServedBuild(): Promise<string | null> {
  try {
    const res = await fetch(BUILD_FILE, { cache: "no-store", credentials: "omit" });
    if (!res.ok) return null;
    return servedBuild(await res.json());
  } catch {
    return null;
  }
}

/** True once the server serves a build other than the one this page runs. */
export function useNewBuildAvailable(): boolean {
  const [newer, setNewer] = useState(false);
  useEffect(() => {
    if (!LOADED_BUILD) return;
    let stopped = false;
    // Coming back to a tab fires both focus and visibilitychange: one GET.
    let inFlight = false;
    const onVisible = () => void check();
    const stop = () => {
      stopped = true;
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("focus", onVisible);
    };
    const check = async () => {
      if (stopped || inFlight || document.visibilityState === "hidden") return;
      inFlight = true;
      try {
        if (isNewerBuild(LOADED_BUILD, await fetchServedBuild()) && !stopped) {
          setNewer(true);
          stop(); // Said once; nothing more to learn until a refresh.
        }
      } finally {
        inFlight = false;
      }
    };
    const timer = window.setInterval(() => void check(), BUILD_POLL_MS);
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("focus", onVisible);
    void check();
    return stop;
  }, []);
  return newer;
}
