import type { AudioSource } from "expo-audio";
import { useEffect, useState } from "react";

import { apiUrl } from "./api-url.ts";
import { authClient } from "./auth.ts";

/** A private clip still requires the editor's session; never attach cookies to another origin. */
export function usePrivateAudioSource(url: string | null | undefined): AudioSource {
  const [source, setSource] = useState<{ url: string; cookie: string } | null>(null);
  const privateClip = !!url?.includes("b=private");
  useEffect(() => {
    let active = true;
    if (url && privateClip && new URL(url).origin === new URL(apiUrl()).origin) {
      void Promise.resolve(authClient.getCookie())
        .then((cookie) => {
          if (active && cookie) setSource({ url, cookie });
          return undefined;
        })
        .catch(() => undefined);
    }
    return () => {
      active = false;
    };
  }, [url, privateClip]);
  if (!privateClip) return url ?? null;
  return source && source.url === url
    ? { uri: source.url, headers: { Cookie: source.cookie } }
    : null;
}
