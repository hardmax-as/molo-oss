import { useQuery, useQueryClient } from "@tanstack/react-query";
import * as SecureStore from "expo-secure-store";

import { getMe, type Me } from "./api.ts";
import { authClient } from "./auth.ts";
import { previewStore } from "./preview-state.ts";
import { forgetThisDevice } from "./push-ports.ts";

/** The signed-in user with roles from `user_roles`, or null. */
export function useMe() {
  return useQuery<Me | null>({
    queryKey: ["me"],
    queryFn: async () => {
      try {
        return await getMe();
      } catch {
        return null;
      }
    },
    staleTime: 60_000,
  });
}

/** Query keys that belong to the signed-in learner and must not outlive the session. */
const LEARNER_KEYS = new Set([
  "progress",
  "hearts",
  "crown",
  "review-session",
  "league",
  "league-history",
  "plus-packages",
  "pending-reviews",
  "editor-review",
  "editor-studio",
]);

/** The Expo client keeps the cookie under `${storagePrefix}_cookie` (src/lib/auth.ts uses "molo"). */
const COOKIE_KEYS = ["molo_cookie", "molo_session_data"];

/**
 * Signs out and forgets everything the learner owned. The Better Auth call
 * can reject after the server session is already gone (its session store
 * re-initialises on sign-out and imports an optional native module on the
 * way), so the local clean-up never depends on it resolving.
 */
export function useSignOut() {
  const qc = useQueryClient();
  return async () => {
    previewStore.set(null, false);
    qc.removeQueries({ queryKey: ["editor-preview"] });
    // The push token needs the session cookie to be withdrawn, so it goes first.
    await forgetThisDevice();
    try {
      await authClient.signOut();
    } catch {
      // The server session is revoked first; make sure the cookie is gone too.
      await Promise.all(
        COOKIE_KEYS.map((k) => SecureStore.setItemAsync(k, "{}").catch(() => undefined)),
      );
    }
    qc.removeQueries({ predicate: (q) => LEARNER_KEYS.has(String(q.queryKey[0])) });
    await qc.invalidateQueries({ queryKey: ["me"] });
  };
}
