import { useQuery, useQueryClient } from "@tanstack/react-query";

import { getMe, type Me } from "./api.ts";
import { authClient } from "./auth.ts";
import { previewStore } from "./preview-state.ts";
import { forgetCachedPages } from "./sw.ts";

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

export function isEditorial(me: Me | null | undefined): boolean {
  return !!me && me.roles.some((r) => r === "editor" || r === "admin");
}

/** Narrower than `isEditorial`: the developer gallery is for admins only. */
export function isAdmin(me: Me | null | undefined): boolean {
  return !!me && me.roles.includes("admin");
}

export function useSignOut() {
  const qc = useQueryClient();
  return async () => {
    previewStore.set(null, false);
    qc.removeQueries({ queryKey: ["editor-preview"] });
    await authClient.signOut();
    // The service worker keeps no learner state, but the last page and the
    // last unit it holds were fetched with this person's session.
    forgetCachedPages();
    await qc.invalidateQueries({ queryKey: ["me"] });
  };
}
