import { Link, Navigate, useRouterState } from "@tanstack/react-router";
import {
  BookOpen,
  Library,
  LogIn,
  LogOut,
  Menu,
  PenLine,
  RotateCcw,
  Settings,
  Trophy,
  UserRound,
  X,
  type LucideIcon,
} from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { useCallback, useEffect, useRef, useState, type ReactNode, type RefObject } from "react";

import { AgeStep } from "~/components/AgeStep.tsx";
import { Launch } from "~/components/Launch.tsx";
import { ProgressStrip } from "~/components/ProgressStrip.tsx";
import { KnobsBanner } from "~/dev/knobs.tsx";
import { accountReady, ageStepBlocks } from "~/lib/age-step.ts";
import { useFocusTrap } from "~/lib/focus.ts";
import { useSyncGuestProgress } from "~/lib/guest-sync.tsx";
import { useLang, useT } from "~/lib/i18n.tsx";
import { easeOut, useMotionPrefs } from "~/lib/motion.ts";
import { useSyncOnboardingDraft } from "~/lib/onboarding.tsx";
import { isEditorial, useMe, useSignOut } from "~/lib/session.tsx";
import { usePreview } from "~/lib/use-preview.ts";

import { PreviewBanner } from "./EditorPreview.tsx";

/** The shell: a warm header with the wordmark, the learner's progress, and page transitions. */
export function Layout({ children }: { children: ReactNode }) {
  const preview = usePreview();
  const t = useT();
  const { lang, setLang } = useLang();
  const me = useMe();
  const signOut = useSignOut();
  const { reduced } = useMotionPrefs();
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const inLesson = /^\/learn\/[^/]+\/[^/]+$/.test(pathname);
  // A one-tap Apple/Google account gives its birth year and country before anything else.
  const ageStep = ageStepBlocks(me.data, pathname);
  const ready = accountReady(me.data);
  // `shrink-0` so a link keeps its label rather than being squeezed. Under
  // 640 px the header shows only what fits a 320 px viewport and the rest
  // goes into the menu (docs/DESIGN.md); from 640 px up the nav may scroll.
  const linkBase =
    "shrink-0 items-center gap-1.5 rounded-2xl px-3 py-2 text-sm font-semibold text-indigo/80 hover:bg-sand-deep hover:text-indigo [&.active]:bg-indigo [&.active]:text-white";
  // Header entries that only fit from 640 px; on a phone they live in the menu.
  const link = `inline-flex ${linkBase}`;
  const wideLink = `hidden sm:inline-flex ${linkBase}`;
  const [menuOpen, setMenuOpen] = useState(false);
  const menuButton = useRef<HTMLButtonElement | null>(null);
  // A new page (or Account, a new place on Settings) closes the menu, and so does a signed-out session.
  const signedIn = Boolean(me.data);
  const hash = useRouterState({ select: (s) => s.location.hash });
  useEffect(() => setMenuOpen(false), [pathname, hash, signedIn]);
  const closeMenu = useCallback(() => setMenuOpen(false), []);
  return (
    <div className="min-h-full">
      {/* The first second: a greeting that lifts off the page on its own and
          never takes a click with it. */}
      <Launch />
      {!preview.enabled && ready && <BackgroundSync />}
      {/* Nothing at all unless a developer override is in force, and then
          impossible to miss: a stale knob must never be mistaken for a bug
          in the app. It renders above the header so it survives scrolling
          past it. */}
      <KnobsBanner />
      {/* First tab stop on every page (WCAG 2.4.1). Invisible until focused. */}
      <a
        href="#main"
        className="sr-only rounded-2xl bg-indigo px-4 py-3 font-display font-semibold text-white focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-50"
      >
        {t("a11y.skipToContent")}
      </a>
      {/* `id` so the path's section header can measure how far to stick down. */}
      <header
        id="app-header"
        className="sticky top-0 z-30 border-b border-sand-deep/80 bg-sand/85 backdrop-blur"
      >
        <PreviewBanner />
        <nav
          className="mx-auto flex max-w-5xl items-center gap-1 overflow-x-auto px-4 py-2"
          aria-label={t("a11y.mainNav")}
        >
          <Link to="/" className="mr-3 flex items-center gap-2" aria-label={t("app.name")}>
            <Wordmark />
          </Link>
          {/* Phones (under 640 px) get the essentials only: signed out, the
              wordmark, the language and Sign in ("Get started" is on the page
              itself); signed in, Learn and a menu with the rest. Nothing may
              push a 320 px page sideways (docs/DESIGN.md). */}
          <Link to="/" className={me.data ? link : wideLink} activeOptions={{ exact: true }}>
            <BookOpen size={16} aria-hidden /> {t("nav.learn")}
          </Link>
          {/* The reference page is reachable at any time, signed in or not
              (docs/GRAMMAR.md section 1): on a phone, from the menu or, before
              sign-in, from the landing page and the path. */}
          <Link to="/grammar" className={wideLink}>
            <Library size={16} aria-hidden /> {t("nav.grammar")}
          </Link>
          {ready && (
            <>
              <Link to="/review" className={wideLink}>
                <RotateCcw size={16} aria-hidden /> {t("nav.review")}
              </Link>
              <Link to="/leagues" className={wideLink}>
                <Trophy size={16} aria-hidden /> {t("nav.leagues")}
              </Link>
            </>
          )}
          {isEditorial(me.data) && (
            <Link to="/edit" className={wideLink}>
              <PenLine size={16} aria-hidden /> {t("nav.edit")}
            </Link>
          )}
          <span className="grow" />
          {/* Phones: one tap flips the language; the full menu needs the width. */}
          <button
            type="button"
            onClick={() => setLang(lang === "nb" ? "en" : "nb")}
            className="min-h-11 min-w-11 shrink-0 rounded-xl border border-mist-soft bg-cloud px-2 text-sm font-semibold text-indigo sm:hidden"
            aria-label={t("common.switchLanguage", {
              language: lang === "nb" ? t("common.en") : t("common.nb"),
            })}
          >
            {lang === "nb" ? "EN" : "NB"}
          </button>
          <label className="hidden items-center gap-1 text-sm text-mist sm:flex">
            <span className="sr-only">{t("common.language")}</span>
            <select
              value={lang}
              onChange={(e) => setLang(e.target.value === "nb" ? "nb" : "en")}
              className="rounded-xl border border-mist-soft bg-cloud px-2 py-1 text-sm text-indigo"
            >
              <option value="en">{t("common.en")}</option>
              <option value="nb">{t("common.nb")}</option>
            </select>
          </label>
          {me.data ? (
            <>
              {ready && (
                <>
                  {/* Account lands on the first section of Settings; the gear opens the page. */}
                  <Link
                    to="/settings"
                    hash="account"
                    className={wideLink}
                    aria-label={t("nav.account")}
                    activeOptions={{ includeHash: true }}
                    data-testid="header-account"
                  >
                    <UserRound size={16} aria-hidden />
                  </Link>
                  <Link to="/settings" className={wideLink} aria-label={t("settings.title")}>
                    <Settings size={16} aria-hidden />
                  </Link>
                </>
              )}
              <button
                type="button"
                className={wideLink}
                onClick={() => void signOut()}
                aria-label={t("nav.signOut")}
              >
                <LogOut size={16} aria-hidden /> {t("nav.signOut")}
              </button>
              <button
                ref={menuButton}
                type="button"
                className="inline-flex min-h-11 min-w-11 shrink-0 items-center justify-center rounded-xl text-indigo hover:bg-sand-deep sm:hidden"
                aria-label={t("nav.menu")}
                aria-expanded={menuOpen}
                aria-controls={menuOpen ? "app-menu" : undefined}
                onClick={() => setMenuOpen((open) => !open)}
                data-testid="app-menu-button"
              >
                {menuOpen ? <X size={22} aria-hidden /> : <Menu size={22} aria-hidden />}
              </button>
            </>
          ) : (
            <Link to="/auth" className={`${link} min-h-11`} data-testid="header-sign-in">
              <LogIn size={16} aria-hidden /> {t("nav.signIn")}
            </Link>
          )}
        </nav>
        <AnimatePresence>
          {me.data && menuOpen && (
            <PhoneMenu key="menu" reduced={reduced} buttonRef={menuButton} onClose={closeMenu}>
              <MenuLink to="/grammar" Icon={Library} label={t("nav.grammar")} />
              {ready && (
                <>
                  <MenuLink to="/review" Icon={RotateCcw} label={t("nav.review")} />
                  <MenuLink to="/leagues" Icon={Trophy} label={t("nav.leagues")} />
                </>
              )}
              {isEditorial(me.data) && <MenuLink to="/edit" Icon={PenLine} label={t("nav.edit")} />}
              {ready && (
                <>
                  <MenuLink
                    to="/settings"
                    hash="account"
                    Icon={UserRound}
                    label={t("nav.account")}
                    testId="menu-account"
                  />
                  <MenuLink to="/settings" Icon={Settings} label={t("settings.title")} />
                </>
              )}
              <li>
                <button type="button" className={menuItem} onClick={() => void signOut()}>
                  <LogOut size={18} aria-hidden /> {t("nav.signOut")}
                </button>
              </li>
            </PhoneMenu>
          )}
        </AnimatePresence>
        {!inLesson && !preview.enabled && ready && <ProgressStrip />}
      </header>
      {/* `tabIndex={-1}` so the skip link can move focus here, not just scroll. */}
      <main id="main" tabIndex={-1} className="mx-auto max-w-5xl px-4 py-6">
        <AnimatePresence mode="wait" initial={false}>
          <motion.div
            key={pathname}
            initial={reduced ? { opacity: 0 } : { opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={reduced ? { opacity: 0 } : { opacity: 0, y: -6 }}
            transition={{ duration: reduced ? 0.1 : 0.2, ease: [0.22, 1, 0.36, 1] }}
          >
            {ageStep ? (
              <AgeStep />
            ) : preview.enabled && !["/preview", "/settings"].includes(pathname) ? (
              <Navigate to="/preview" replace />
            ) : (
              children
            )}
          </motion.div>
        </AnimatePresence>
      </main>
    </div>
  );
}

/** "Molo" in the display face with a sun dot: the whole brand in 60 px. */
function Wordmark() {
  return (
    <span className="relative inline-flex items-center font-display text-2xl font-bold tracking-tight text-indigo">
      <span
        className="mr-1 inline-block h-5 w-5 rounded-full bg-sun shadow-[inset_-3px_-3px_0_0_#D9772B]"
        aria-hidden
      />
      Molo
    </span>
  );
}

const menuItem =
  "flex min-h-11 w-full items-center gap-3 rounded-2xl px-4 py-2 text-left text-base font-semibold text-indigo hover:bg-sand [&.active]:bg-indigo [&.active]:text-white";

function MenuLink({
  to,
  hash,
  Icon,
  label,
  testId,
}: {
  to: "/grammar" | "/review" | "/leagues" | "/edit" | "/settings";
  hash?: string;
  Icon: LucideIcon;
  label: string;
  testId?: string;
}) {
  return (
    <li>
      <Link
        to={to}
        {...(hash ? { hash, activeOptions: { includeHash: true } } : {})}
        className={menuItem}
        data-testid={testId}
      >
        <Icon size={18} aria-hidden /> {label}
      </Link>
    </li>
  );
}

/**
 * The phone menu: everything the header cannot fit under 640 px. Focus
 * moves in on open and is trapped there; Escape, a tap outside, a new page
 * or a window grown past the breakpoint closes it, and focus goes back to
 * the button (docs/ACCESSIBILITY.md, WCAG 2.1.2 and 2.4.3). Every entry is
 * at least 44 px tall.
 */
function PhoneMenu({
  children,
  reduced,
  buttonRef,
  onClose,
}: {
  children: ReactNode;
  reduced: boolean;
  buttonRef: RefObject<HTMLButtonElement | null>;
  onClose: () => void;
}) {
  const panel = useRef<HTMLDivElement | null>(null);
  useFocusTrap(panel, true, onClose);
  useEffect(() => {
    const outside = (e: PointerEvent) => {
      const target = e.target as Node;
      if (panel.current?.contains(target) || buttonRef.current?.contains(target)) return;
      onClose();
    };
    const wide = window.matchMedia("(min-width: 640px)");
    const grew = () => {
      if (wide.matches) onClose();
    };
    document.addEventListener("pointerdown", outside);
    wide.addEventListener("change", grew);
    return () => {
      document.removeEventListener("pointerdown", outside);
      wide.removeEventListener("change", grew);
    };
  }, [buttonRef, onClose]);
  return (
    <motion.div
      ref={panel}
      id="app-menu"
      className="absolute right-3 top-full z-40 mt-1 w-64 max-w-[calc(100vw-1.5rem)] rounded-3xl border border-sand-deep bg-cloud p-2 shadow-pop sm:hidden"
      initial={reduced ? { opacity: 0 } : { opacity: 0, y: -6 }}
      animate={{ opacity: 1, y: 0 }}
      exit={reduced ? { opacity: 0 } : { opacity: 0, y: -6 }}
      transition={{ duration: reduced ? 0.1 : 0.16, ease: easeOut }}
    >
      <ul className="flex flex-col gap-1">{children}</ul>
    </motion.div>
  );
}

function BackgroundSync() {
  useSyncOnboardingDraft();
  useSyncGuestProgress();
  return null;
}
