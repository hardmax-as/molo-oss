/**
 * Where the "Close" in a modal's bar should go. Normally back; but a modal
 * can be the only screen on the stack — onboarding replaces itself with the
 * sign-up sheet, and a cold deep link opens the Plus sheet directly — and
 * then `back()` has nowhere to go and the button does nothing. The learner
 * would be stuck on a form they did not want. So: back when there is a
 * back, otherwise the path.
 */
export function closeModal(router: {
  canGoBack: () => boolean;
  back: () => void;
  replace: (href: "/") => void;
}): "back" | "home" {
  if (router.canGoBack()) {
    router.back();
    return "back";
  }
  router.replace("/");
  return "home";
}
