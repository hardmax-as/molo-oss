import { isAdmin, useMe } from "~/lib/session.tsx";

/**
 * Who may see the developer gallery: a development build, or an `admin`
 * account on any build. It is gated the way the editor dashboard is — a role
 * check against `/me` in the layout route — with the development build added.
 *
 * `import.meta.env.DEV` is a compile-time constant, so a production bundle
 * evaluates this to "admins only". A learner never routes into `/dev`.
 */
export function useDevAccess(): { allowed: boolean; pending: boolean } {
  const me = useMe();
  if (import.meta.env.DEV) return { allowed: true, pending: false };
  return { allowed: isAdmin(me.data), pending: me.isPending };
}
