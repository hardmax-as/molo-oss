import {
  hasPasswordSignIn,
  isSocialProvider,
  normaliseAccountName,
  PASSWORD_MAX_LENGTH,
  PASSWORD_MIN_LENGTH,
  passwordRefusal,
  SOCIAL_PROVIDER_NAMES,
} from "@molo/core";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useState, type FormEvent } from "react";
import { toast } from "sonner";

import { useLinkedAccounts } from "~/components/ConnectedAccounts.tsx";
import { Button } from "~/components/ui/Button.tsx";
import { Card } from "~/components/ui/Card.tsx";
import { ApiError, setFirstPassword } from "~/lib/api.ts";
import { authClient } from "~/lib/auth.ts";
import { useT } from "~/lib/i18n.tsx";

const field =
  "mt-1 w-full rounded-2xl border-2 border-mist-soft bg-cloud px-4 py-3 text-base text-ink focus:border-sun";
const heading = "font-display text-lg font-semibold text-indigo";

class AuthRefusal extends Error {
  constructor(readonly code: string | undefined) {
    super(code ?? "refused");
  }
}

/**
 * Settings → Account: the e-mail the learner signs in with, their name, a
 * new e-mail (confirmed from the new inbox) and the password. Everything
 * here goes to Better Auth's own endpoints except a first password on an
 * Apple/Google-only account (`POST /me/password`).
 */
export function AccountSettings({ name, email }: { name: string; email: string }) {
  return (
    <>
      <ProfileCard name={name} email={email} />
      <EmailCard email={email} />
      <PasswordCard />
    </>
  );
}

function ProfileCard({ name, email }: { name: string; email: string }) {
  const t = useT();
  const qc = useQueryClient();
  const [value, setValue] = useState(name);
  const valid = normaliseAccountName(value) !== null;
  const save = useMutation({
    mutationFn: async () => {
      const r = await authClient.updateUser({ name: normaliseAccountName(value) ?? "" });
      if (r.error) throw new AuthRefusal(r.error.code);
    },
    onSuccess: async () => {
      toast.success(t("settings.profile.nameSaved"));
      await qc.invalidateQueries({ queryKey: ["me"] });
    },
    onError: (e) =>
      toast.error(
        e instanceof AuthRefusal && e.code === "INVALID_NAME"
          ? t("settings.profile.nameInvalid")
          : t("common.error"),
      ),
  });
  return (
    <Card index={1}>
      <p className="text-sm text-mist">{t("settings.profile.body")}</p>
      <p className="mt-3 text-sm font-semibold text-indigo">{t("settings.profile.email")}</p>
      <p className="break-all text-base text-ink" data-testid="account-email">
        {email}
      </p>
      <form
        className="mt-4 space-y-3"
        onSubmit={(e) => {
          e.preventDefault();
          if (valid) save.mutate();
        }}
      >
        <label className="block text-sm font-semibold text-indigo">
          {t("settings.profile.name")}
          <input
            value={value}
            onChange={(e) => setValue(e.target.value)}
            maxLength={80}
            autoComplete="name"
            aria-describedby="account-name-hint"
            aria-invalid={!valid}
            className={field}
            data-testid="account-name"
          />
        </label>
        <p id="account-name-hint" className="text-sm text-mist">
          {t("settings.profile.nameHint")}
        </p>
        {!valid && (
          <p role="alert" className="text-sm font-semibold text-coral-deep">
            {t("settings.profile.nameInvalid")}
          </p>
        )}
        <Button
          type="submit"
          variant="indigo"
          disabled={save.isPending || !valid || value.trim() === name}
        >
          {t("settings.profile.nameSave")}
        </Button>
      </form>
    </Card>
  );
}

function EmailCard({ email }: { email: string }) {
  const t = useT();
  const [next, setNext] = useState("");
  const [sentTo, setSentTo] = useState<string | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const send = useMutation({
    mutationFn: async (newEmail: string) => {
      const r = await authClient.changeEmail({ newEmail });
      if (r.error) throw new AuthRefusal(r.error.code);
      return newEmail;
    },
    onMutate: () => setProblem(null),
    onSuccess: (to) => {
      setSentTo(to);
      setNext("");
    },
    onError: () => setProblem(t("common.error")),
  });
  function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const newEmail = next.trim().toLowerCase();
    if (!e.currentTarget.checkValidity() || newEmail === "") {
      setProblem(t("settings.profile.emailInvalid"));
      return;
    }
    if (newEmail === email.toLowerCase()) {
      setProblem(t("settings.profile.emailSame"));
      return;
    }
    send.mutate(newEmail);
  }
  return (
    <Card index={1}>
      <form className="space-y-3" onSubmit={submit} noValidate>
        <h3 className={heading}>{t("settings.profile.changeEmail")}</h3>
        <label className="block text-sm font-semibold text-indigo">
          {t("settings.profile.newEmail")}
          <input
            type="email"
            required
            value={next}
            onChange={(e) => setNext(e.target.value)}
            autoComplete="email"
            aria-describedby="account-email-hint"
            className={field}
            data-testid="account-new-email"
          />
        </label>
        <p id="account-email-hint" className="text-sm text-mist">
          {t("settings.profile.emailHint")}
        </p>
        {problem && (
          <p role="alert" className="text-sm font-semibold text-coral-deep">
            {problem}
          </p>
        )}
        {sentTo && (
          <p role="status" className="rounded-2xl bg-sand p-3 text-sm text-ink">
            {t("settings.profile.emailSent", { email: sentTo })}
          </p>
        )}
        <Button type="submit" variant="outline" disabled={send.isPending}>
          {t("settings.profile.emailSend")}
        </Button>
      </form>
    </Card>
  );
}

function PasswordCard() {
  const t = useT();
  const qc = useQueryClient();
  const accounts = useLinkedAccounts();
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [signOutOthers, setSignOutOthers] = useState(true);
  const [problem, setProblem] = useState<string | null>(null);
  const providers = (accounts.data ?? []).map((a) => a.providerId);
  const hasPassword = hasPasswordSignIn(providers);
  const refusal = (code: string | undefined) => {
    const kind = passwordRefusal(code);
    return kind === "wrong"
      ? t("settings.profile.passwordWrong")
      : kind === "short"
        ? t("settings.profile.passwordShort", { min: PASSWORD_MIN_LENGTH })
        : t("common.error");
  };
  const change = useMutation({
    mutationFn: async () => {
      const r = await authClient.changePassword({
        currentPassword: current,
        newPassword: next,
        revokeOtherSessions: signOutOthers,
      });
      if (r.error) throw new AuthRefusal(r.error.code);
    },
    onMutate: () => setProblem(null),
    onSuccess: () => {
      setCurrent("");
      setNext("");
      toast.success(t("settings.profile.passwordChanged"));
    },
    onError: (e) => setProblem(refusal(e instanceof AuthRefusal ? e.code : undefined)),
  });
  const set = useMutation({
    mutationFn: () => setFirstPassword(next),
    onMutate: () => setProblem(null),
    onSuccess: async () => {
      setNext("");
      toast.success(t("settings.profile.passwordSet"));
      await qc.invalidateQueries({ queryKey: ["linked-accounts"] });
    },
    onError: (e) => setProblem(refusal(e instanceof ApiError ? e.code : undefined)),
  });
  if (accounts.isPending || accounts.isError) return null;
  const socialNames = providers
    .filter(isSocialProvider)
    .map((p) => SOCIAL_PROVIDER_NAMES[p])
    .join(" / ");
  const tooShort = next.length > 0 && next.length < PASSWORD_MIN_LENGTH;
  const busy = change.isPending || set.isPending;
  return (
    <Card index={1}>
      <form
        className="space-y-3"
        data-testid={hasPassword ? "password-change" : "password-set"}
        onSubmit={(e) => {
          e.preventDefault();
          if (next.length < PASSWORD_MIN_LENGTH) {
            setProblem(t("settings.profile.passwordShort", { min: PASSWORD_MIN_LENGTH }));
            return;
          }
          if (hasPassword) change.mutate();
          else set.mutate();
        }}
      >
        <h3 className={heading}>
          {hasPassword ? t("settings.profile.password") : t("settings.profile.setPassword")}
        </h3>
        {!hasPassword && (
          <p className="text-sm text-mist">
            {t("settings.profile.setPasswordHint", { providers: socialNames })}
          </p>
        )}
        {hasPassword && (
          <label className="block text-sm font-semibold text-indigo">
            {t("settings.profile.currentPassword")}
            <input
              type="password"
              required
              value={current}
              onChange={(e) => setCurrent(e.target.value)}
              autoComplete="current-password"
              className={field}
              data-testid="current-password"
            />
          </label>
        )}
        <label className="block text-sm font-semibold text-indigo">
          {t("settings.profile.newPassword")}
          <input
            type="password"
            required
            minLength={PASSWORD_MIN_LENGTH}
            maxLength={PASSWORD_MAX_LENGTH}
            value={next}
            onChange={(e) => setNext(e.target.value)}
            autoComplete="new-password"
            aria-describedby="new-password-hint"
            aria-invalid={tooShort}
            className={field}
            data-testid="new-password"
          />
        </label>
        <p id="new-password-hint" className="text-sm text-mist">
          {t("auth.passwordHint")}
        </p>
        {hasPassword && (
          <label className="flex items-center gap-3 text-sm font-semibold text-indigo">
            <input
              type="checkbox"
              checked={signOutOthers}
              onChange={(e) => setSignOutOthers(e.target.checked)}
              className="h-5 w-5 accent-sea"
            />
            {t("settings.profile.signOutOthers")}
          </label>
        )}
        {problem && (
          <p role="alert" className="text-sm font-semibold text-coral-deep">
            {problem}
          </p>
        )}
        <Button type="submit" variant="outline" disabled={busy || (hasPassword && current === "")}>
          {hasPassword ? t("settings.profile.passwordSave") : t("settings.profile.setPasswordSave")}
        </Button>
      </form>
    </Card>
  );
}
