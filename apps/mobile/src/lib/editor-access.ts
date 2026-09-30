/** Same role gate as web /edit; the API remains the authority. */
export function canReview(me: { roles: readonly string[] } | null | undefined): boolean {
  return !!me && (me.roles.includes("editor") || me.roles.includes("admin"));
}
