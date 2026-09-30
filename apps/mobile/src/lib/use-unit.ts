import type { UnitResponse } from "@molo/core";
import type { UiLanguage } from "@molo/i18n";
import { queryOptions, useQuery } from "@tanstack/react-query";
import { useCallback, useMemo } from "react";

import { DEMO_UNIT_SLUG, demoUnit } from "~/fixtures/demo-unit.ts";

import { getUnit } from "./api.ts";
import { localiseUnit } from "./download-logic.ts";
import { downloadedFiles } from "./download-ports.ts";
import { useLang } from "./i18n.tsx";
import { cacheUnit, cachedUnit } from "./offline.ts";
import { CONTENT_GC_MS } from "./query-client.ts";
import { downloadKey, useDownloads } from "./use-downloads.ts";

export type LoadedUnit = UnitResponse & { offline: boolean };

const NO_FILES: ReadonlyMap<string, string> = new Map();

/**
 * Network first, the device's copy when the network fails (airplane mode),
 * and the __DEV__ fixture for its slug. The answer is the payload as the API
 * sent it; which recordings are on the device is applied on top by
 * `useUnit`, so a download finishing never costs a second fetch.
 */
export function fetchUnitForDevice(slug: string, lang: UiLanguage): Promise<LoadedUnit> {
  if (__DEV__ && slug === DEMO_UNIT_SLUG)
    return Promise.resolve({ ...demoUnit(lang), offline: false });
  return getUnit(slug, lang).then(
    (fresh) => cacheUnit(slug, lang, fresh).then(() => ({ ...fresh, offline: false })),
    (e: unknown) =>
      cachedUnit(slug, lang).then((cached) => {
        if (cached) return { ...cached, offline: true };
        throw e;
      }),
  );
}

/**
 * The one definition of a unit query, so a screen that prefetches it (the
 * home screen, a lesson node) fills exactly the entry the unit and lesson
 * screens read. Its stale and garbage-collection times are the content
 * defaults in `query-client.ts`.
 */
export function unitQueryKey(slug: string, lang: UiLanguage) {
  return ["unit", slug, lang] as const;
}

export function unitQueryOptions(slug: string, lang: UiLanguage) {
  return queryOptions({
    queryKey: unitQueryKey(slug, lang),
    queryFn: () => fetchUnitForDevice(slug, lang),
  });
}

/**
 * A unit for the current language, drawn at once from whatever is already
 * known (docs/CACHING.md section 2.0): the copy in memory if a screen or a
 * prefetch asked for it, otherwise the copy the device stored the last time
 * the unit was opened, shown while the network answers. Only a unit never
 * opened on this device waits.
 *
 * Whichever copy is used, every recording the device already has is played
 * from the device. That is not only for the game reserve: the audience this
 * matters most to is paying roaming rates, and a word they have downloaded
 * should never be paid for twice. Audio URLs are the file's own SHA-256, so
 * a recording an editor has replaced has a different URL, is not among the
 * downloaded files, and comes from the network by itself.
 */
export function useUnit(slug: string) {
  const { lang } = useLang();
  const downloads = useDownloads();
  const enabled = slug !== "";
  // Part of the files key so the screen re-reads the moment a download
  // finishes or is removed, and the URLs change with it.
  const downloadedAt = downloads.ready.get(downloadKey(slug, lang))?.at ?? 0;
  const files = useQuery({
    queryKey: ["unit-files", slug, lang, downloadedAt],
    queryFn: () => (downloadedAt > 0 ? downloadedFiles(slug, lang) : Promise.resolve(NO_FILES)),
    enabled,
    staleTime: Infinity,
    gcTime: CONTENT_GC_MS,
  });
  // The device's own copy, read only to stand in while the network answers.
  const stored = useQuery({
    queryKey: ["unit-stored", slug, lang],
    queryFn: () => cachedUnit(slug, lang),
    enabled: enabled && !(__DEV__ && slug === DEMO_UNIT_SLUG),
    staleTime: Infinity,
    gcTime: CONTENT_GC_MS,
  });
  // Not "offline": the network has not answered yet, it has not failed.
  const placeholder = useMemo<LoadedUnit | undefined>(
    () => (stored.data ? { ...stored.data, offline: false } : undefined),
    [stored.data],
  );
  const placeholderData = useCallback(() => placeholder, [placeholder]);
  const local = files.data;
  const select = useCallback(
    (unit: LoadedUnit): LoadedUnit =>
      local && local.size > 0 ? { ...localiseUnit(unit, local), offline: unit.offline } : unit,
    [local],
  );
  return useQuery({
    ...unitQueryOptions(slug, lang),
    enabled,
    placeholderData,
    select,
  });
}
