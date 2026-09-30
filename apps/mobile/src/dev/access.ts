import { useMe } from "~/lib/session.tsx";

/**
 * Who may see the developer gallery: a development build, or an `admin`
 * account on any build. It is the same shape as the editor dashboard's gate
 * on the web — a role check on `/me` — with the development build added, and
 * it is the only thing that decides. The Settings row, the Developer screen
 * and every demo screen all ask this one question, so there is no second
 * door to keep in step.
 *
 * A learner (no roles, or `learner`/`editor`) never sees any of it in a
 * release build.
 */
export function useDevAccess(): boolean {
  const me = useMe();
  if (__DEV__) return true;
  return me.data?.roles.includes("admin") === true;
}
