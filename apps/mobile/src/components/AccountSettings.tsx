import {
  hasPasswordSignIn,
  isSocialProvider,
  normaliseAccountName,
  PASSWORD_MAX_LENGTH,
  PASSWORD_MIN_LENGTH,
  passwordRefusal,
  SOCIAL_PROVIDER_NAMES,
} from "@molo/core";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Text, TextInput, View } from "react-native";

import { listAccounts } from "~/components/ConnectedAccounts.tsx";
import { useAnnounce } from "~/lib/announce.ts";
import { ApiError, setFirstPassword } from "~/lib/api.ts";
import { authClient } from "~/lib/auth.ts";
import { useT } from "~/lib/i18n.tsx";
import { Button } from "~/ui/Button.tsx";
import { Card } from "~/ui/Card.tsx";
import { Switch } from "~/ui/Switch.tsx";
import { colors } from "~/ui/theme.ts";

const field =
  "min-h-12 rounded-2xl border-2 border-cloud-deep bg-cloud px-4 py-3 font-body text-base text-ink";
// Loose on purpose: the server checks the address; this only catches a slip before a round trip.
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

class AuthRefusal extends Error {
  constructor(readonly code: string | undefined) {
    super(code ?? "refused");
  }
}

function Alert({ message, id }: { message: string | null; id: string }) {
  if (!message) return null;
  return (
    <Text
      accessibilityRole="alert"
      accessibilityLiveRegion="polite"
      className="font-body-semibold text-sm text-coral-deep"
      testID={id}
    >
      {message}
    </Text>
  );
}

function Note({ message, id }: { message: string | null; id: string }) {
  if (!message) return null;
  return (
    <Text accessibilityLiveRegion="polite" className="font-body text-sm text-sea-deep" testID={id}>
      {message}
    </Text>
  );
}

/**
 * Settings → Account, under the signed-in card: the name, a new e-mail
 * (confirmed from the new inbox, which lands on the web Settings page) and
 * the password. Everything goes to Better Auth's own endpoints except a
 * first password on an Apple/Google-only account (`POST /me/password`).
 */
export function AccountSettings({ name, email }: { name: string; email: string }) {
  return (
    <>
      <NameCard name={name} />
      <EmailCard email={email} />
      <PasswordCard />
    </>
  );
}

function NameCard({ name }: { name: string }) {
  const t = useT();
  const qc = useQueryClient();
  const [value, setValue] = useState(name);
  const valid = normaliseAccountName(value) !== null;
  const save = useMutation({
    mutationFn: async () => {
      const r = await authClient.updateUser({ name: normaliseAccountName(value) ?? "" });
      if (r.error) throw new AuthRefusal(r.error.code);
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["me"] }),
  });
  const problem = !valid
    ? t("settings.profile.nameInvalid")
    : save.error
      ? save.error instanceof AuthRefusal && save.error.code === "INVALID_NAME"
        ? t("settings.profile.nameInvalid")
        : t("common.error")
      : null;
  const done = save.isSuccess ? t("settings.profile.nameSaved") : null;
  useAnnounce(problem ?? done);
  return (
    <Card index={1}>
      <View className="gap-3">
        <Text className="font-body-semibold text-sm text-ink">{t("settings.profile.name")}</Text>
        <TextInput
          value={value}
          onChangeText={(v) => {
            setValue(v);
            save.reset();
          }}
          maxLength={80}
          autoComplete="name"
          textContentType="name"
          accessibilityLabel={t("settings.profile.name")}
          accessibilityHint={t("settings.profile.nameHint")}
          className={field}
          testID="account-name"
          placeholderTextColor={colors.mistSoft}
        />
        <Text className="font-body text-sm text-mist">{t("settings.profile.nameHint")}</Text>
        <Alert message={problem} id="account-name-error" />
        <Note message={done} id="account-name-saved" />
        <View className="items-start">
          <Button
            label={t("settings.profile.nameSave")}
            variant="sea"
            disabled={save.isPending || !valid || value.trim() === name}
            onPress={() => save.mutate()}
            testID="account-name-save"
          />
        </View>
      </View>
    </Card>
  );
}

function EmailCard({ email }: { email: string }) {
  const t = useT();
  const [next, setNext] = useState("");
  const [problem, setProblem] = useState<string | null>(null);
  const send = useMutation({
    mutationFn: async (newEmail: string) => {
      const r = await authClient.changeEmail({ newEmail });
      if (r.error) throw new AuthRefusal(r.error.code);
      return newEmail;
    },
    onMutate: () => setProblem(null),
    onSuccess: () => setNext(""),
    onError: () => setProblem(t("common.error")),
  });
  const sent = send.data ? t("settings.profile.emailSent", { email: send.data }) : null;
  useAnnounce(problem ?? sent);
  function submit() {
    const newEmail = next.trim().toLowerCase();
    if (!EMAIL.test(newEmail)) return setProblem(t("settings.profile.emailInvalid"));
    if (newEmail === email.toLowerCase()) return setProblem(t("settings.profile.emailSame"));
    send.mutate(newEmail);
  }
  return (
    <Card index={1}>
      <View className="gap-3">
        <Text className="font-display text-lg text-indigo">
          {t("settings.profile.changeEmail")}
        </Text>
        <Text className="font-body-semibold text-sm text-ink">
          {t("settings.profile.newEmail")}
        </Text>
        <TextInput
          value={next}
          onChangeText={setNext}
          autoCapitalize="none"
          autoComplete="email"
          textContentType="emailAddress"
          keyboardType="email-address"
          accessibilityLabel={t("settings.profile.newEmail")}
          accessibilityHint={t("settings.profile.emailHint")}
          className={field}
          testID="account-new-email"
          placeholderTextColor={colors.mistSoft}
          returnKeyType="send"
          onSubmitEditing={submit}
        />
        <Text className="font-body text-sm text-mist">{t("settings.profile.emailHint")}</Text>
        <Alert message={problem} id="account-email-error" />
        <Note message={sent} id="account-email-sent" />
        <View className="items-start">
          <Button
            label={t("settings.profile.emailSend")}
            variant="cloud"
            disabled={send.isPending || next.trim() === ""}
            onPress={submit}
            testID="account-email-send"
          />
        </View>
      </View>
    </Card>
  );
}

function PasswordCard() {
  const t = useT();
  const qc = useQueryClient();
  const accounts = useQuery({ queryKey: ["linked-accounts"], queryFn: listAccounts });
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [signOutOthers, setSignOutOthers] = useState(true);
  const [problem, setProblem] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);
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
    onSuccess: () => {
      setCurrent("");
      setNext("");
      setDone(t("settings.profile.passwordChanged"));
    },
    onError: (e) => setProblem(refusal(e instanceof AuthRefusal ? e.code : undefined)),
  });
  const set = useMutation({
    mutationFn: () => setFirstPassword(next),
    onSuccess: async () => {
      setNext("");
      setDone(t("settings.profile.passwordSet"));
      await qc.invalidateQueries({ queryKey: ["linked-accounts"] });
    },
    onError: (e) => setProblem(refusal(e instanceof ApiError ? e.code : undefined)),
  });
  useAnnounce(problem ?? done);
  if (accounts.isPending || accounts.isError) return null;
  const socialNames = providers
    .filter(isSocialProvider)
    .map((p) => SOCIAL_PROVIDER_NAMES[p])
    .join(" / ");
  const busy = change.isPending || set.isPending;
  function submit() {
    setProblem(null);
    setDone(null);
    if (next.length < PASSWORD_MIN_LENGTH)
      return setProblem(t("settings.profile.passwordShort", { min: PASSWORD_MIN_LENGTH }));
    if (hasPassword) change.mutate();
    else set.mutate();
  }
  return (
    <Card index={1}>
      <View className="gap-3" testID={hasPassword ? "password-change" : "password-set"}>
        <Text className="font-display text-lg text-indigo">
          {hasPassword ? t("settings.profile.password") : t("settings.profile.setPassword")}
        </Text>
        {!hasPassword && (
          <Text className="font-body text-sm text-mist">
            {t("settings.profile.setPasswordHint", { providers: socialNames })}
          </Text>
        )}
        {hasPassword && (
          <>
            <Text className="font-body-semibold text-sm text-ink">
              {t("settings.profile.currentPassword")}
            </Text>
            <TextInput
              value={current}
              onChangeText={setCurrent}
              secureTextEntry
              autoComplete="current-password"
              textContentType="password"
              accessibilityLabel={t("settings.profile.currentPassword")}
              className={field}
              testID="current-password"
            />
          </>
        )}
        <Text className="font-body-semibold text-sm text-ink">
          {t("settings.profile.newPassword")}
        </Text>
        <TextInput
          value={next}
          onChangeText={setNext}
          secureTextEntry
          maxLength={PASSWORD_MAX_LENGTH}
          autoComplete="new-password"
          textContentType="newPassword"
          accessibilityLabel={t("settings.profile.newPassword")}
          accessibilityHint={t("auth.passwordHint")}
          className={field}
          testID="new-password"
        />
        <Text className="font-body text-xs text-mist">{t("auth.passwordHint")}</Text>
        {hasPassword && (
          <View className="min-h-11 flex-row items-center justify-between gap-3">
            <Text className="flex-1 font-body-semibold text-base text-ink">
              {t("settings.profile.signOutOthers")}
            </Text>
            <Switch
              label={t("settings.profile.signOutOthers")}
              value={signOutOthers}
              onValueChange={setSignOutOthers}
              testID="sign-out-others"
            />
          </View>
        )}
        <Alert message={problem} id="password-error" />
        <Note message={done} id="password-done" />
        <View className="items-start">
          <Button
            label={
              hasPassword
                ? t("settings.profile.passwordSave")
                : t("settings.profile.setPasswordSave")
            }
            variant="cloud"
            disabled={busy || next === "" || (hasPassword && current === "")}
            onPress={submit}
            testID="password-save"
          />
        </View>
      </View>
    </Card>
  );
}
