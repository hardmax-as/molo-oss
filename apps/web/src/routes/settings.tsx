import {
  isSocialProvider,
  SOURCE_LANGUAGES,
  type SocialProvider,
  confirmWordMatches,
} from "@molo/core";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, createFileRoute, useNavigate, useRouterState } from "@tanstack/react-router";
import { Volume2, VolumeX, Waves, Wind } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";

import { AccountSettings } from "~/components/AccountSettings.tsx";
import { ConnectedAccounts } from "~/components/ConnectedAccounts.tsx";
import { PreviewSwitch } from "~/components/EditorPreview.tsx";
import { LeagueSettings } from "~/components/LeagueSettings.tsx";
import { Button, ButtonLink } from "~/components/ui/Button.tsx";
import { Card } from "~/components/ui/Card.tsx";
import { WebWithdrawals } from "~/components/WebWithdrawals.tsx";
import { useDevAccess } from "~/dev/access.ts";
import { DEV_STRINGS } from "~/dev/strings.ts";
import { deleteMyAccount, exportMyData, getCourses, putPrefs } from "~/lib/api.ts";
import { useT } from "~/lib/i18n.tsx";
import { useMotionSetting } from "~/lib/motion.ts";
import { useProgress } from "~/lib/progress.ts";
import { NOINDEX } from "~/lib/seo.ts";
import { useSignOut } from "~/lib/session.tsx";
import { useMe } from "~/lib/session.tsx";
import { useSfx } from "~/lib/sfx.tsx";

export const Route = createFileRoute("/settings")({
  head: () => ({ meta: [NOINDEX] }),
  // Better Auth redirects a failed link back here with `?error=<code>`; the
  // provider rides on the error callback URL so the message can name it.
  // `?email=changed` is where the new address's confirmation link lands
  // (apps/api/src/account-email.ts); it is greeted once and dropped.
  validateSearch: (
    search: Record<string, unknown>,
  ): { error?: string; provider?: SocialProvider; email?: "changed" } => ({
    ...(typeof search["error"] === "string" ? { error: search["error"] } : {}),
    ...(isSocialProvider(search["provider"]) ? { provider: search["provider"] } : {}),
    ...(search["email"] === "changed" ? { email: "changed" as const } : {}),
  }),
  component: SettingsPage,
});

const field =
  "mt-1 w-full rounded-2xl border-2 border-mist-soft bg-cloud px-4 py-3 text-base text-ink focus:border-sun";

/** Daily goal, source language for glosses, reminders (server-side prefs) and the sound toggle (this browser). */
function SettingsPage() {
  const t = useT();
  const qc = useQueryClient();
  const me = useMe();
  const sfx = useSfx();
  const motion = useMotionSetting();
  const dev = useDevAccess();
  const progress = useProgress();
  const search = Route.useSearch();
  const navigate = useNavigate();
  useEffect(() => {
    if (search.email !== "changed") return;
    toast.success(t("settings.profile.emailChanged"));
    void qc.invalidateQueries({ queryKey: ["me"] });
    void navigate({ to: "/settings", search: {}, hash: "account", replace: true });
  }, [search.email, navigate, qc, t]);
  // `/settings#account` (the header's Account entry): the section renders
  // after the session loads, so the browser's own jump to it comes too early,
  // and a second tap while already on Settings changes only the hash.
  const signedIn = !!me.data;
  const hash = useRouterState({ select: (s) => s.location.hash });
  useEffect(() => {
    if (signedIn && hash === "account") document.getElementById("account")?.scrollIntoView();
  }, [signedIn, hash]);
  // One course exists, so the picker is disabled with "more languages
  // later" — it is here so the enrolment plumbing is exercised, not
  // theoretical (docs/ARCHITECTURE.md section 2.6).
  const courses = useQuery({ queryKey: ["courses"], queryFn: getCourses, enabled: !!me.data });
  const [goal, setGoal] = useState("50");
  const [lang, setLang] = useState<"en" | "nb">("en");
  const [reminders, setReminders] = useState(false);
  const [listening, setListening] = useState(true);
  const [speaking, setSpeaking] = useState(true);
  const [voice, setVoice] = useState("any");
  const [confirmText, setConfirmText] = useState("");
  const signOut = useSignOut();
  const exportData = useMutation({
    mutationFn: exportMyData,
    onSuccess: (data) => {
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `molo-export-${new Date().toISOString().slice(0, 10)}.json`;
      a.click();
      URL.revokeObjectURL(url);
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : t("common.error")),
  });
  const deleteAccount = useMutation({
    mutationFn: () => deleteMyAccount(),
    onSuccess: async () => {
      toast.success(t("account.deleted"));
      await signOut();
      window.location.assign("/");
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : t("common.error")),
  });
  useEffect(() => {
    if (progress.data) setGoal(String(progress.data.dailyGoalXp));
  }, [progress.data]);
  useEffect(() => {
    if (me.data) {
      setLang(me.data.sourceLang);
      setReminders(me.data.prefs.reminderOptIn);
      setListening(me.data.prefs.listeningEnabled);
      setSpeaking(me.data.prefs.speakingEnabled);
      setVoice(me.data.prefs.preferredVoice);
    }
  }, [me.data]);
  const save = useMutation({
    mutationFn: () =>
      putPrefs({
        dailyGoalXp: Number(goal),
        sourceLang: lang,
        reminderOptIn: reminders,
        listeningEnabled: listening,
        speakingEnabled: speaking,
        preferredVoice: voice,
      }),
    onSuccess: async () => {
      toast.success(t("settings.saved"));
      await Promise.all([
        qc.invalidateQueries({ queryKey: ["me"] }),
        qc.invalidateQueries({ queryKey: ["progress"] }),
        qc.invalidateQueries({ queryKey: ["unit"] }),
      ]);
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : t("common.error")),
  });

  // Developer: a development build, or an admin account. A learner on a
  // production build never sees this card, and `/dev` asks the same question
  // again (docs/DESIGN.md "Developer gallery").
  const developerCard = dev.allowed ? (
    <Card index={1} className="border-2 border-dashed border-mist-soft">
      <h2 className="font-display text-lg font-semibold text-indigo">{DEV_STRINGS.settingsRow}</h2>
      <p className="mb-3 text-sm text-mist">{DEV_STRINGS.settingsRowHint}</p>
      <ButtonLink to="/dev" variant="outline" data-testid="settings-developer">
        {DEV_STRINGS.title}
      </ButtonLink>
    </Card>
  ) : null;

  const soundCard = (
    <Card index={1} className="flex items-center justify-between gap-4">
      <div>
        <h2 className="font-display text-lg font-semibold text-indigo">{t("settings.sound")}</h2>
        <p id="sound-hint" className="text-sm text-mist">
          {t("settings.soundHint")}
        </p>
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={sfx.enabled}
        aria-label={t("settings.sound")}
        aria-describedby="sound-hint"
        onClick={() => {
          sfx.setEnabled(!sfx.enabled);
          if (!sfx.enabled) sfx.play("tap");
        }}
        className={`pressable inline-flex h-12 w-12 items-center justify-center rounded-full ${sfx.enabled ? "border-sun-deep bg-sun text-indigo" : "border-mist bg-mist-soft text-mist"}`}
      >
        {sfx.enabled ? <Volume2 size={22} aria-hidden /> : <VolumeX size={22} aria-hidden />}
      </button>
    </Card>
  );

  // Reduced motion: `prefers-reduced-motion` is the default, this is the
  // in-app override (WCAG 2.3.3, DESIGN.md "Motion").
  const motionCard = (
    <Card index={1} className="flex items-center justify-between gap-4">
      <div>
        <h2 className="font-display text-lg font-semibold text-indigo">{t("settings.motion")}</h2>
        <p id="motion-hint" className="text-sm text-mist">
          {t("settings.motionHint")}
        </p>
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={motion.reduced}
        aria-label={t("settings.motion")}
        aria-describedby="motion-hint"
        onClick={() => motion.set(!motion.reduced)}
        className={`pressable inline-flex h-12 w-12 items-center justify-center rounded-full ${motion.reduced ? "border-sun-deep bg-sun text-indigo" : "border-mist bg-mist-soft text-mist"}`}
      >
        {motion.reduced ? <Wind size={22} aria-hidden /> : <Waves size={22} aria-hidden />}
      </button>
    </Card>
  );

  if (me.isPending) return <p className="text-mist">{t("common.loading")}</p>;
  if (!me.data) {
    return (
      <section className="mx-auto max-w-md space-y-4">
        <h1 className="font-display text-3xl font-bold text-indigo">{t("settings.title")}</h1>
        <PreviewSwitch />
        {soundCard}
        {motionCard}
        {developerCard}
        <Card index={2}>
          <p className="mb-4 text-mist">{t("settings.signInFirst")}</p>
          <ButtonLink to="/auth" variant="indigo">
            {t("auth.signIn")}
          </ButtonLink>
        </Card>
      </section>
    );
  }
  return (
    <section className="mx-auto max-w-md space-y-4">
      <h1 className="font-display text-3xl font-bold text-indigo">{t("settings.title")}</h1>
      <PreviewSwitch />
      {/* Account first: who you are and how you sign in. The header's Account entry lands here. */}
      <section id="account" aria-labelledby="account-heading" className="scroll-mt-28 space-y-4">
        <h2 id="account-heading" className="font-display text-2xl font-bold text-indigo">
          {t("settings.profile.title")}
        </h2>
        <AccountSettings name={me.data.user.name} email={me.data.user.email} />
        {me.data.leagueProfile && <LeagueSettings profile={me.data.leagueProfile} />}
        <ConnectedAccounts
          callbackError={
            search.error ? { code: search.error, provider: search.provider ?? null } : undefined
          }
        />
      </section>
      {soundCard}
      {motionCard}
      <Card index={2}>
        <form
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            save.mutate();
          }}
        >
          <label className="block text-sm font-semibold text-indigo">
            {t("settings.dailyGoal")}
            <input
              type="number"
              min={10}
              max={500}
              step={10}
              value={goal}
              onChange={(e) => setGoal(e.target.value)}
              className={field}
            />
          </label>
          <label className="block text-sm font-semibold text-indigo">
            {t("settings.sourceLang")}
            <select
              value={lang}
              onChange={(e) => setLang(e.target.value as "en" | "nb")}
              className={field}
            >
              {SOURCE_LANGUAGES.map((l) => (
                <option key={l} value={l}>
                  {l === "nb" ? "Norsk" : "English"}
                </option>
              ))}
            </select>
          </label>
          <div>
            <label className="block text-sm font-semibold text-indigo">
              {t("settings.course")}
              <select
                value={me.data.course.id}
                disabled
                aria-describedby="course-hint"
                className={`${field} opacity-60`}
              >
                {(courses.data?.courses ?? [me.data.course]).map((course) => (
                  <option key={course.id} value={course.id}>
                    {t(course.titleKey as never) || course.slug}
                  </option>
                ))}
              </select>
            </label>
            <p id="course-hint" className="text-xs text-mist">
              {t("settings.courseHint")}
            </p>
          </div>
          <label className="flex items-center gap-3 text-sm font-semibold text-indigo">
            <input
              type="checkbox"
              checked={reminders}
              onChange={(e) => setReminders(e.target.checked)}
              className="h-5 w-5 accent-sea"
            />
            {t("settings.reminders")}
          </label>
          <div>
            {/* The hint is the field's description, not part of its name. */}
            <label className="block text-sm font-semibold text-indigo">
              {t("settings.voice")}
              <select
                value={voice}
                onChange={(e) => setVoice(e.target.value)}
                className={field}
                aria-describedby="voice-hint"
              >
                <option value="any">{t("settings.voiceAny")}</option>
                <option value="female">{t("settings.voiceFemale")}</option>
                <option value="male">{t("settings.voiceMale")}</option>
                <option value="child">{t("settings.voiceChild")}</option>
              </select>
            </label>
            <p id="voice-hint" className="text-xs text-mist">
              {t("settings.voiceHint")}
            </p>
          </div>
          <fieldset className="space-y-2 rounded-2xl bg-sand p-4">
            <legend className="px-1 text-sm font-semibold text-indigo">
              {t("settings.modes")}
            </legend>
            <p className="text-xs text-mist">{t("settings.modesHint")}</p>
            <label className="flex items-center gap-3 text-sm font-semibold text-indigo">
              <input
                type="checkbox"
                checked={listening}
                onChange={(e) => setListening(e.target.checked)}
                className="h-5 w-5 accent-sea"
              />
              {t("settings.listening")}
            </label>
            <label className="flex items-center gap-3 text-sm font-semibold text-indigo">
              <input
                type="checkbox"
                checked={speaking}
                onChange={(e) => setSpeaking(e.target.checked)}
                className="h-5 w-5 accent-sea"
              />
              {t("settings.speaking")}
            </label>
          </fieldset>
          <Button type="submit" disabled={save.isPending} variant="indigo">
            {t("settings.save")}
          </Button>
        </form>
      </Card>
      <Card index={3} className="space-y-4">
        <h2 className="font-display text-lg font-semibold text-indigo">{t("plus.title")}</h2>
        <ButtonLink to="/plus" variant="outline">
          {t("plus.title")}
        </ButtonLink>
        <WebWithdrawals />
      </Card>
      <Card index={3} className="mt-4 space-y-3">
        <h2 className="font-display text-lg font-semibold text-indigo">{t("account.title")}</h2>
        <p className="text-sm text-mist">{t("account.body")}</p>
        <div className="flex flex-wrap gap-2 text-sm">
          <Link to="/privacy" className="underline">
            {t("legal.privacy")}
          </Link>
          <Link to="/terms" className="underline">
            {t("legal.terms")}
          </Link>
          <Link to="/licences" className="underline">
            {t("legal.licences")}
          </Link>
        </div>
        <Button
          variant="outline"
          disabled={exportData.isPending}
          onClick={() => exportData.mutate()}
        >
          {t("account.export")}
        </Button>
        <div className="rounded-2xl border border-coral/40 p-3">
          <h3 className="text-sm font-semibold text-coral-deep">{t("account.deleteTitle")}</h3>
          <p id="delete-hint" className="text-xs text-mist">
            {t("account.deleteBody", { word: t("account.confirmWord") })}{" "}
            {t("account.deleteStoreNote")}
          </p>
          <label className="mt-2 block text-xs font-semibold text-indigo">
            {t("account.confirmLabel", { word: t("account.confirmWord") })}
            <input
              type="text"
              value={confirmText}
              onChange={(e) => setConfirmText(e.target.value)}
              autoComplete="off"
              autoCapitalize="characters"
              spellCheck={false}
              aria-describedby="delete-hint"
              className="mt-1 w-full rounded-xl border-2 border-mist-soft bg-cloud px-2 py-1.5 text-sm font-normal"
            />
          </label>
          <Button
            variant="coral"
            size="sm"
            className="mt-2"
            disabled={
              deleteAccount.isPending || !confirmWordMatches(confirmText, t("account.confirmWord"))
            }
            onClick={() => {
              if (window.confirm(t("account.deleteConfirm"))) deleteAccount.mutate();
            }}
          >
            {t("account.delete")}
          </Button>
        </div>
      </Card>
      {developerCard}
    </section>
  );
}
