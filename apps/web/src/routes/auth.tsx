import {
  ageEligibility,
  isSocialProvider,
  isUnlinkedSocialAccount,
  registrationCountryFromLanguage,
  SOCIAL_PROVIDER_NAMES,
  type SocialProvider,
} from "@molo/core";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, Navigate, createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState, type FormEvent } from "react";
import { toast } from "sonner";

import { AgeFields } from "~/components/AgeFields.tsx";
import { Button } from "~/components/ui/Button.tsx";
import { Card } from "~/components/ui/Card.tsx";
import { getAuthProviders } from "~/lib/api.ts";
import { authClient } from "~/lib/auth.ts";
import { useT } from "~/lib/i18n.tsx";
import { NOINDEX } from "~/lib/seo.ts";
import { useMe } from "~/lib/session.tsx";

export const Route = createFileRoute("/auth")({
  head: () => ({ meta: [NOINDEX] }),
  validateSearch: (
    search: Record<string, unknown>,
  ): {
    mode?: "signup";
    error?: string;
    provider?: SocialProvider;
    age?: "under13" | "under18ZA";
  } => ({
    ...(search["mode"] === "signup" ? { mode: "signup" as const } : {}),
    // Set by the age step after the server deleted an account below the minimum age.
    ...(search["age"] === "under13" || search["age"] === "under18ZA" ? { age: search["age"] } : {}),
    ...(typeof search["error"] === "string" ? { error: search["error"] } : {}),
    // Set on the error callback URL so a redirect error names the provider that was tried.
    ...(isSocialProvider(search["provider"]) ? { provider: search["provider"] } : {}),
  }),
  component: AuthPage,
});

function AuthPage() {
  const t = useT();
  const qc = useQueryClient();
  const navigate = useNavigate();
  const me = useMe();
  const initial = Route.useSearch();
  const [mode, setMode] = useState<"signin" | "signup" | "magic">(initial.mode ?? "signin");
  const [busy, setBusy] = useState(false);
  const [age, setAge] = useState({ birthYear: "", country: "OTHER", ageReached: false });
  useEffect(() => {
    setAge((current) => ({
      ...current,
      country: registrationCountryFromLanguage(navigator.language),
    }));
  }, []);
  // The last social refusal, shown directly under the social buttons. A
  // redirect back from the provider seeds it from `?error=` (a Better Auth
  // code, never rendered as copy).
  const [socialError, setSocialError] = useState<{
    provider: SocialProvider | null;
    code?: string;
    message?: string;
  } | null>(initial.error ? { provider: initial.provider ?? null, code: initial.error } : null);
  const notLinked = !!socialError && isUnlinkedSocialAccount(socialError);
  const providerName = socialError?.provider ? SOCIAL_PROVIDER_NAMES[socialError.provider] : null;
  const socialMessage = !socialError
    ? null
    : socialError.code === "AGE" && socialError.message
      ? socialError.message
      : notLinked && providerName
        ? t("auth.errors.notLinked", { provider: providerName })
        : t("auth.errors.generic");
  const ageDeclaration = { ...age, birthYear: Number(age.birthYear) };
  function validateAge() {
    const result = ageEligibility(ageDeclaration);
    if (!result.ok) throw new Error(t(`age.errors.${result.reason}`));
  }
  // Set after a sign-up that needs email verification: the form gives way to "check your inbox".
  const [sentTo, setSentTo] = useState<string | null>(null);
  const providers = useQuery({
    queryKey: ["auth-providers"],
    queryFn: getAuthProviders,
    staleTime: 600_000,
  });
  async function social(provider: SocialProvider) {
    setBusy(true);
    setSocialError(null);
    try {
      if (mode === "signup") {
        const result = ageEligibility(ageDeclaration);
        if (!result.ok) {
          setSocialError({ provider, code: "AGE", message: t(`age.errors.${result.reason}`) });
          setBusy(false);
          return;
        }
      }
      // Every tap may create the account: a new Apple/Google identity gets one
      // at once, and the age step follows unless the sign-up form already
      // carried the declaration (docs/ARCHITECTURE.md, "Registration age gate").
      const r = await authClient.signIn.social({
        provider,
        callbackURL: window.location.origin,
        errorCallbackURL: `${window.location.origin}/auth?provider=${provider}`,
        requestSignUp: true,
        ...(mode === "signup" ? { additionalData: { ageDeclaration } } : {}),
      });
      if (r.error) {
        setSocialError({
          provider,
          ...(r.error.code ? { code: r.error.code } : {}),
          ...(r.error.message ? { message: r.error.message } : {}),
        });
        setBusy(false);
      }
    } catch {
      setSocialError({ provider });
      setBusy(false);
    }
  }

  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const email = String(f.get("email") ?? "");
    const password = String(f.get("password") ?? "");
    const name = String(f.get("name") ?? "");
    setBusy(true);
    try {
      if (mode === "magic") {
        const r = await authClient.signIn.magicLink({ email, callbackURL: window.location.origin });
        if (r.error) throw new Error(r.error.message ?? "magic link failed");
        toast.success(t("auth.magicLinkSent"));
        return;
      }
      if (mode === "signup") validateAge();
      // The verification link signs the browser in and lands on the home page with a greeting.
      const callbackURL = `${window.location.origin}/?verified=1`;
      const r =
        mode === "signup"
          ? await authClient.signUp.email({ email, password, name, callbackURL, ...ageDeclaration })
          : await authClient.signIn.email({ email, password, callbackURL });
      if (r.error) {
        if (r.error.code === "AGE_REQUIREMENT") throw new Error(t("age.errors.invalid"));
        // Production requires a verified address; the server has just (re)sent the link.
        if (r.error.code === "EMAIL_NOT_VERIFIED") throw new Error(t("auth.errors.unverified"));
        throw new Error(r.error.message ?? t("auth.errors.invalid"));
      }
      // No session yet means the address must be verified first; the link signs the user in.
      if (mode === "signup" && !r.data?.token) {
        setSentTo(email);
        return;
      }
      await qc.invalidateQueries({ queryKey: ["me"] });
      await navigate({ to: "/" });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t("auth.errors.generic"));
    } finally {
      setBusy(false);
    }
  }

  async function resend() {
    if (!sentTo) return;
    setBusy(true);
    try {
      const r = await authClient.sendVerificationEmail({
        email: sentTo,
        callbackURL: `${window.location.origin}/?verified=1`,
      });
      if (r.error) throw new Error(r.error.message ?? t("auth.errors.generic"));
      toast.success(t("auth.resent"));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t("auth.errors.generic"));
    } finally {
      setBusy(false);
    }
  }

  const field =
    "mt-1 w-full rounded-2xl border-2 border-mist-soft bg-cloud px-4 py-3 text-base text-ink placeholder:text-mist focus:border-sun";
  const switchLink =
    "font-semibold text-indigo underline decoration-sun decoration-2 underline-offset-4";
  // Signed in already (a bookmark, the back button): there is nothing to sign in to.
  if (me.data && !busy) return <Navigate to="/" replace />;
  if (sentTo) {
    return (
      <section className="mx-auto max-w-md">
        <Card className="p-8" role="status">
          <p className="font-display text-sm font-semibold uppercase tracking-widest text-sea-deep">
            Molo!
          </p>
          <h1 className="mb-4 font-display text-3xl font-bold text-indigo">
            {t("auth.checkInbox")}
          </h1>
          <p className="text-ink">{t("auth.verifySent", { email: sentTo })}</p>
          <div className="mt-6 flex flex-wrap gap-4 text-sm">
            <Button type="button" variant="outline" disabled={busy} onClick={() => void resend()}>
              {t("auth.resend")}
            </Button>
            <button
              type="button"
              className={`${switchLink} self-center`}
              onClick={() => {
                setSentTo(null);
                setMode("signin");
              }}
            >
              {t("auth.backToSignIn")}
            </button>
          </div>
        </Card>
      </section>
    );
  }
  return (
    <section className="mx-auto max-w-md">
      <Card className="p-8">
        <p className="font-display text-sm font-semibold uppercase tracking-widest text-sea-deep">
          Molo!
        </p>
        <h1 className="mb-6 font-display text-3xl font-bold text-indigo">
          {mode === "signup" ? t("auth.signUp") : t("auth.signIn")}
        </h1>
        {initial.age && (
          <div role="alert" className="mb-6 space-y-2 rounded-2xl bg-sand p-4 text-ink">
            <p>{t(`age.errors.${initial.age}`)}</p>
            <p className="text-sm">{t("age.deleted")}</p>
          </div>
        )}
        <form onSubmit={(e) => void submit(e)} className="space-y-4">
          {mode === "signup" && (
            <label className="block text-sm font-semibold text-indigo">
              {t("auth.name")}
              <input name="name" required className={field} autoComplete="name" />
            </label>
          )}
          {mode === "signup" && <AgeFields value={age} onChange={setAge} />}
          <label className="block text-sm font-semibold text-indigo">
            {t("auth.email")}
            <input name="email" type="email" required className={field} autoComplete="email" />
          </label>
          {mode !== "magic" && (
            <div>
              {/* The hint sits outside the label so it is the field's
                  description, not part of its name (WCAG 3.3.2). */}
              <label className="block text-sm font-semibold text-indigo">
                {t("auth.password")}
                <input
                  name="password"
                  type="password"
                  required
                  minLength={10}
                  className={field}
                  aria-describedby="password-hint"
                  autoComplete={mode === "signup" ? "new-password" : "current-password"}
                />
              </label>
              <p id="password-hint" className="mt-1 text-xs text-mist">
                {t("auth.passwordHint")}
              </p>
            </div>
          )}
          {(providers.data?.apple || providers.data?.google) && (
            <div className="space-y-2">
              {providers.data?.apple && (
                <Button
                  type="button"
                  variant="indigo"
                  className="w-full"
                  disabled={busy}
                  onClick={() => void social("apple")}
                >
                  {t("auth.withApple")}
                </Button>
              )}
              {providers.data?.google && (
                <Button
                  type="button"
                  variant="outline"
                  className="w-full"
                  disabled={busy}
                  onClick={() => void social("google")}
                >
                  {t("auth.withGoogle")}
                </Button>
              )}
              {/* The refusal sits under the button that was pressed, not above the form. */}
              {socialMessage && (
                <div role="alert" className="space-y-2 rounded-2xl bg-sand p-4 text-ink">
                  <p>{socialMessage}</p>
                </div>
              )}
              <p className="text-center text-xs text-mist">{t("auth.or")}</p>
            </div>
          )}
          <p className="text-xs text-mist">
            {t("legal.accept")}{" "}
            <Link to="/terms" className="underline">
              {t("legal.terms")}
            </Link>{" "}
            {t("legal.and")}{" "}
            <Link to="/privacy" className="underline">
              {t("legal.privacy")}
            </Link>
          </p>
          <Button type="submit" disabled={busy} size="lg" className="w-full">
            {mode === "magic"
              ? t("auth.magicLink")
              : mode === "signup"
                ? t("auth.signUp")
                : t("auth.signIn")}
          </Button>
        </form>
        <div className="mt-6 flex flex-wrap gap-4 text-sm text-mist">
          {mode !== "signin" && (
            <button type="button" className={switchLink} onClick={() => setMode("signin")}>
              {t("auth.signIn")}
            </button>
          )}
          {mode !== "signup" && (
            <button type="button" className={switchLink} onClick={() => setMode("signup")}>
              {t("auth.signUp")}
            </button>
          )}
          {mode !== "magic" && (
            <button type="button" className={switchLink} onClick={() => setMode("magic")}>
              {t("auth.magicLink")}
            </button>
          )}
        </div>
      </Card>
    </section>
  );
}
