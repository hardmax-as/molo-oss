import { ageEligibility, ageStepOutcome, registrationCountryFromLanguage } from "@molo/core";
import { useQueryClient } from "@tanstack/react-query";
import { Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState, type FormEvent } from "react";

import { AgeFields } from "~/components/AgeFields.tsx";
import { Button } from "~/components/ui/Button.tsx";
import { Card } from "~/components/ui/Card.tsx";
import { ApiError, confirmAge } from "~/lib/api.ts";
import { authClient } from "~/lib/auth.ts";
import { useT } from "~/lib/i18n.tsx";
import { useSignOut } from "~/lib/session.tsx";

/**
 * "Your birth year and country": the one screen a one-tap Apple or Google
 * account sees before anything else. The same fields, rule and copy as the
 * sign-up form; nothing else is asked (no name or e-mail again after Apple).
 * The API refuses every other route until this is accepted, so this screen
 * is a courtesy over a rule the server enforces.
 */
export function AgeStep() {
  const t = useT();
  const qc = useQueryClient();
  const navigate = useNavigate();
  const signOut = useSignOut();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [age, setAge] = useState({ birthYear: "", country: "OTHER", ageReached: false });
  useEffect(() => {
    setAge((current) => ({
      ...current,
      country: registrationCountryFromLanguage(navigator.language),
    }));
  }, []);

  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const declaration = { ...age, birthYear: Number(age.birthYear) };
    const local = ageEligibility(declaration);
    // Below the minimum age the server deletes the account; everything else is fixed here first.
    if (!local.ok && (local.reason === "invalid" || local.reason === "confirm")) {
      setError(t(`age.errors.${local.reason}`));
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await confirmAge(declaration);
      await qc.invalidateQueries({ queryKey: ["me"] });
    } catch (err) {
      const outcome = ageStepOutcome(
        err instanceof ApiError ? { code: err.code, details: err.details } : null,
      );
      if (outcome.kind === "deleted") {
        // The server has deleted the account and ended the session; forget it here too.
        await authClient.signOut().catch(() => undefined);
        qc.clear();
        await navigate({ to: "/auth", search: { age: outcome.reason } });
        return;
      }
      setError(
        outcome.kind === "retry" && outcome.reason !== "generic"
          ? t(`age.errors.${outcome.reason}`)
          : t("auth.errors.generic"),
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="mx-auto max-w-md">
      <Card className="p-8">
        <p className="font-display text-sm font-semibold uppercase tracking-widest text-sea-deep">
          Molo!
        </p>
        <h1 className="mb-2 font-display text-3xl font-bold text-indigo">{t("age.stepTitle")}</h1>
        <p className="mb-6 text-ink">{t("age.stepBody")}</p>
        <form onSubmit={(e) => void submit(e)} className="space-y-4">
          <AgeFields value={age} onChange={setAge} />
          {error && (
            <p role="alert" className="rounded-2xl bg-sand p-4 text-ink">
              {error}
            </p>
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
            {t("age.stepContinue")}
          </Button>
        </form>
        <button
          type="button"
          className="mt-6 text-sm font-semibold text-indigo underline decoration-sun decoration-2 underline-offset-4"
          onClick={() => void signOut()}
        >
          {t("nav.signOut")}
        </button>
      </Card>
    </section>
  );
}
