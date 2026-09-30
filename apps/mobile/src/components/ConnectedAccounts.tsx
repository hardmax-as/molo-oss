import { isSocialProvider, SOCIAL_PROVIDER_NAMES, type SocialProvider } from "@molo/core";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Alert, Platform, Text, View } from "react-native";

import { useAnnounce } from "~/lib/announce.ts";
import { getAuthProviders } from "~/lib/api.ts";
import { authClient } from "~/lib/auth.ts";
import { useT } from "~/lib/i18n.tsx";
import { visibleSocialProviders } from "~/lib/social-auth-logic.ts";
import { linkApple, linkErrorMessage, linkGoogle, SocialAuthError } from "~/lib/social-auth.ts";
import { Button } from "~/ui/Button.tsx";
import { Card } from "~/ui/Card.tsx";
import { useToast } from "~/ui/Toast.tsx";

interface LinkedAccount {
  id: string;
  providerId: string;
}

/** The ways this account signs in (`credential`, `apple`, `google`); Settings → Password reads it too. */
export async function listAccounts(): Promise<LinkedAccount[]> {
  const r = await authClient.listAccounts();
  if (r.error) throw new SocialAuthError(r.error.code ?? "provider_error");
  return r.data.map((a) => ({ id: a.id, providerId: a.providerId }));
}

/**
 * Settings → Connected accounts: the ways this learner can sign in, with
 * Connect for each provider the server offers (`/auth/providers`) and
 * Disconnect for a social account that is not the last way in. Apple
 * connects through the native sheet, so only on iOS; Google through the
 * same browser proxy as sign-in.
 */
export function ConnectedAccounts() {
  const t = useT();
  const qc = useQueryClient();
  const toast = useToast();
  const providers = useQuery({
    queryKey: ["auth-providers"],
    queryFn: getAuthProviders,
    staleTime: 5 * 60_000,
    retry: 0,
  });
  const accounts = useQuery({ queryKey: ["linked-accounts"], queryFn: listAccounts });
  const link = useMutation({
    mutationFn: (provider: SocialProvider) => (provider === "apple" ? linkApple() : linkGoogle()),
    onSuccess: async (result, provider) => {
      if (result === "linked")
        toast.show(t("settings.connected.linked", { provider: SOCIAL_PROVIDER_NAMES[provider] }));
      await qc.invalidateQueries({ queryKey: ["linked-accounts"] });
    },
  });
  const unlink = useMutation({
    mutationFn: async (account: LinkedAccount) => {
      const r = await authClient.unlinkAccount({ accountId: account.id });
      if (r.error) throw new SocialAuthError(r.error.code ?? "provider_error");
    },
    onSuccess: async (_r, account) => {
      if (isSocialProvider(account.providerId))
        toast.show(
          t("settings.connected.unlinked", {
            provider: SOCIAL_PROVIDER_NAMES[account.providerId],
          }),
        );
      await qc.invalidateQueries({ queryKey: ["linked-accounts"] });
    },
  });
  const failed = link.error ?? unlink.error;
  const failedProvider = link.error
    ? link.variables
    : unlink.variables && isSocialProvider(unlink.variables.providerId)
      ? unlink.variables.providerId
      : undefined;
  const message = failed
    ? t(linkErrorMessage(failed), {
        provider: failedProvider ? SOCIAL_PROVIDER_NAMES[failedProvider] : "",
      })
    : null;
  useAnnounce(message);

  const list = accounts.data ?? [];
  const linked = new Set(list.map((a) => a.providerId));
  const offered: SocialProvider[] = [];
  // Same rule as the sign-in screen: on iOS, Google only alongside Apple (guideline 4.8).
  const visible = visibleSocialProviders(Platform.OS, {
    apple: providers.data?.apple ?? false,
    google: providers.data?.google ?? false,
  });
  if (visible.apple && !linked.has("apple")) offered.push("apple");
  if (visible.google && !linked.has("google")) offered.push("google");
  const only = list.length === 1 ? list[0] : undefined;
  const busy = link.isPending || unlink.isPending;

  function confirmUnlink(account: LinkedAccount, provider: SocialProvider) {
    const name = SOCIAL_PROVIDER_NAMES[provider];
    Alert.alert(
      t("settings.connected.disconnect", { provider: name }),
      t("settings.connected.disconnectConfirm", { provider: name }),
      [
        { text: t("common.cancel"), style: "cancel" },
        {
          text: t("settings.connected.disconnect", { provider: name }),
          style: "destructive",
          onPress: () => unlink.mutate(account),
        },
      ],
    );
  }

  return (
    <Card index={5}>
      <Text className="mb-1 font-display text-lg text-indigo">{t("settings.connected.title")}</Text>
      <Text className="mb-3 font-body text-sm text-mist">{t("settings.connected.body")}</Text>
      {accounts.isError && (
        <Text className="mb-2 font-body-semibold text-sm text-coral-deep">{t("common.error")}</Text>
      )}
      <View className="gap-2">
        {list.map((account) => {
          const provider = isSocialProvider(account.providerId) ? account.providerId : null;
          const label = provider
            ? SOCIAL_PROVIDER_NAMES[provider]
            : account.providerId === "credential"
              ? t("settings.connected.email")
              : account.providerId;
          return (
            <View
              key={account.id}
              className="min-h-11 flex-row items-center justify-between gap-3"
              testID={`connected-${account.providerId}`}
            >
              <View className="flex-1">
                <Text className="font-body-semibold text-base text-ink">{label}</Text>
                <Text className="font-body text-sm text-mist">
                  {t("settings.connected.connectedBadge")}
                </Text>
              </View>
              {provider && list.length > 1 && (
                <Button
                  label={t("settings.connected.disconnect", {
                    provider: SOCIAL_PROVIDER_NAMES[provider],
                  })}
                  variant="ghost"
                  size="sm"
                  disabled={busy}
                  onPress={() => confirmUnlink(account, provider)}
                  testID={`disconnect-${provider}`}
                />
              )}
            </View>
          );
        })}
      </View>
      {only && isSocialProvider(only.providerId) && (
        <Text className="mt-2 font-body text-sm text-mist">
          {t("settings.connected.lastMethod")}
        </Text>
      )}
      {offered.length > 0 && (
        <View className="mt-3 items-start gap-2">
          {offered.map((provider) => (
            <Button
              key={provider}
              label={t("settings.connected.connect", {
                provider: SOCIAL_PROVIDER_NAMES[provider],
              })}
              variant="cloud"
              disabled={busy || accounts.isPending}
              onPress={() => link.mutate(provider)}
              testID={`connect-${provider}`}
            />
          ))}
        </View>
      )}
      {message && (
        <Text
          accessibilityRole="alert"
          accessibilityLiveRegion="polite"
          className="mt-3 font-body-semibold text-sm text-coral-deep"
          testID="connected-error"
        >
          {message}
        </Text>
      )}
    </Card>
  );
}
