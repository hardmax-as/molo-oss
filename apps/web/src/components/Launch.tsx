import { AnimatePresence, motion } from "motion/react";
import { useEffect, useState } from "react";

import { Sunbird } from "~/components/illustrations/Sunbird.tsx";
import { useT } from "~/lib/i18n.tsx";
import { MOTION_STORAGE_KEY } from "~/lib/motion.ts";

/**
 * The app's first second on the web: the sunbird arrives, the wordmark
 * settles, and the sand wash lifts off the page. The mobile app does the
 * same thing as the native splash hands over (apps/mobile/src/ui/Launch.tsx).
 *
 * Three rules keep it from being in the way:
 *
 * - it is `pointer-events-none` from the first frame, so a learner who
 *   knows where they are going is never blocked by it;
 * - it renders only after hydration, so the server's markup is unchanged
 *   and a slow client never sees a half-finished greeting;
 * - it happens once per browsing session, and not at all under reduced
 *   motion (docs/DESIGN.md "Motion").
 */
const SESSION_KEY = "molo.launched";

function alreadyGreeted(): boolean {
  try {
    return sessionStorage.getItem(SESSION_KEY) === "1";
  } catch {
    // Private mode: greet, and do not try to remember it.
    return false;
  }
}

function remember(): void {
  try {
    sessionStorage.setItem(SESSION_KEY, "1");
  } catch {
    /* nothing to remember it with */
  }
}

/**
 * Read once, at mount, from the media query and the stored override rather
 * than from `useMotionPrefs()`. The hook's value settles *after* the first
 * client render, and an effect that re-runs when it settles would clear the
 * timer that takes the greeting away — leaving a sand-coloured sheet over
 * the app forever. A greeting must never be able to outlive its own timer.
 */
function motionIsReduced(): boolean {
  if (typeof window === "undefined") return true;
  try {
    const stored = window.localStorage.getItem(MOTION_STORAGE_KEY);
    if (stored === "reduced") return true;
    if (stored === "full") return false;
  } catch {
    // private mode: fall through to the OS setting
  }
  return window.matchMedia?.("(prefers-reduced-motion: reduce)").matches === true;
}

export function Launch({ force = false }: { force?: boolean } = {}) {
  const t = useT();
  const [show, setShow] = useState(false);

  useEffect(() => {
    // `force` is the developer gallery replaying the greeting on demand; the
    // app itself never passes it, so the once-per-session rule is untouched.
    if (!force && (motionIsReduced() || alreadyGreeted())) return;
    if (!force) remember();
    setShow(true);
    const id = setTimeout(() => setShow(false), 900);
    return () => clearTimeout(id);
    // Once per mount, on purpose: see `motionIsReduced`.
    // oxlint-disable-next-line exhaustive-deps
  }, []);

  return (
    <AnimatePresence>
      {show && (
        <motion.div
          key="launch"
          className="pointer-events-none fixed inset-0 z-40 flex flex-col items-center justify-center gap-2 bg-sand"
          role="status"
          aria-label={t("a11y.launch")}
          data-testid="launch"
          initial={{ opacity: 1 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.45, ease: [0.22, 1, 0.36, 1] }}
        >
          <motion.div
            initial={{ x: -80, y: 20, opacity: 0, rotate: -12 }}
            animate={{ x: 0, y: 0, opacity: 1, rotate: 0 }}
            transition={{ type: "spring", stiffness: 220, damping: 18, mass: 0.7 }}
          >
            <Sunbird pose="hello" size={140} />
          </motion.div>
          <motion.p
            className="font-display text-3xl font-bold tracking-tight text-indigo"
            initial={{ y: 10, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            transition={{ delay: 0.16, duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
          >
            {t("app.name")}
          </motion.p>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
