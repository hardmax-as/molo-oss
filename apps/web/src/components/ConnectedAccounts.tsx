import {
  isSocialProvider,
  SOCIAL_PROVIDER_NAMES,
  socialLinkError,
  type SocialProvider,
} from "@molo/core";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";

import { Button } from "~/components/ui/Button.tsx";
import { Card } from "~/components/ui/Card.tsx";
import { getAuthProviders } from "~/lib/api.ts";
import { authClient } from "~/lib/auth.ts";
import { useT } from "~/lib/i18n.tsx";

interface LinkedAccount {
  id: string;
  providerId: string;
}

class LinkError extends Error {
  constructor(
    readonly code: string | undefined,
    readonly provider: SocialProvider | null,
  ) {
    super(code ?? "link_failed");
  }
}

/** The ways this account signs in (`credential`, `apple`, `google`), shared with Settings → Password. */
export function useLinkedAccounts() {
  return useQuery({
    queryKey: ["linked-accounts"],
    queryFn: async (): Promise<LinkedAccount[]> => {
      const r = await authClient.listAccounts();
      if (r.error) throw new LinkError(r.error.code, null);
      return r.data.map((a) => ({ id: a.id, providerId: a.providerId }));
    },
  });
}

/**
 * Settings → Connected accounts: the ways this learner can sign in, Connect
 * for each provider the server offers (`/auth/providers`; a full-page
 * redirect to the provider and back to /settings), and Disconnect for a
 * social account that is not the last way in.
 */
export function ConnectedAccounts({
  callbackError,
}: {
  /** `?error=` from Better Auth's redirect back after a failed link. */
  callbackError?: { code: string; provider: SocialProvider | null } | undefined;
}) {
  const t = useT();
  const qc = useQueryClient();
  const [failure, setFailure] = useState<LinkError | null>(
    callbackError ? new LinkError(callbackError.code, callbackError.provider) : null,
  );
  const providers = useQuery({
    queryKey: ["auth-providers"],
    queryFn: getAuthProviders,
    staleTime: 600_000,
  });
  const accounts = useLinkedAccounts();
  const link = useMutation({
    mutationFn: async (provider: SocialProvider) => {
      const back = `${window.location.origin}/settings`;
      const r = await authClient.linkSocial({
        provider,
        callbackURL: back,
        errorCallbackURL: `${back}?provider=${provider}`,
      });
      if (r.error) throw new LinkError(r.error.code, provider);
    },
    onMutate: () => setFailure(null),
    onError: (e, provider) =>
      setFailure(e instanceof LinkError ? e : new LinkError(undefined, provider)),
  });
  const unlink = useMutation({
    mutationFn: async (account: LinkedAccount) => {
      const r = await authClient.unlinkAccount({ accountId: account.id });
      if (r.error)
        throw new LinkError(
          r.error.code,
          isSocialProvider(account.providerId) ? account.providerId : null,
        );
    },
    onMutate: () => setFailure(null),
    onSuccess: async (_r, account) => {
      if (isSocialProvider(account.providerId))
        toast.success(
          t("settings.connected.unlinked", {
            provider: SOCIAL_PROVIDER_NAMES[account.providerId],
          }),
        );
      await qc.invalidateQueries({ queryKey: ["linked-accounts"] });
    },
    onError: (e) => setFailure(e instanceof LinkError ? e : new LinkError(undefined, null)),
  });

  const kind = failure ? socialLinkError(failure) : null;
  const failedName = failure?.provider ? SOCIAL_PROVIDER_NAMES[failure.provider] : "";
  const message =
    kind === null
      ? null
      : kind === "last"
        ? t("settings.connected.lastMethod")
        : kind === "generic" || (kind !== "reauth" && !failedName)
          ? t("auth.errors.generic")
          : t(`settings.connected.errors.${kind}`, { provider: failedName });

  const list = accounts.data ?? [];
  const linked = new Set(list.map((a) => a.providerId));
  const offered = (["apple", "google"] as const).filter(
    (p) => providers.data?.[p] && !linked.has(p),
  );
  const only = list.length === 1 ? list[0] : undefined;
  const busy = link.isPending || unlink.isPending;

  return (
    <Card index={3} className="space-y-3">
      <h3 className="font-display text-lg font-semibold text-indigo">
        {t("settings.connected.title")}
      </h3>
      <p className="text-sm text-mist">{t("settings.connected.body")}</p>
      {accounts.isError && <p className="text-sm text-coral-deep">{t("common.error")}</p>}
      <ul className="space-y-2">
        {list.map((account) => {
          const provider = isSocialProvider(account.providerId) ? account.providerId : null;
          const label = provider
            ? SOCIAL_PROVIDER_NAMES[provider]
            : account.providerId === "credential"
              ? t("settings.connected.email")
              : account.providerId;
          return (
            <li
              key={account.id}
              className="flex items-center justify-between gap-3"
              data-testid={`connected-${account.providerId}`}
            >
              <span>
                <span className="block font-semibold text-ink">{label}</span>
                <span className="block text-sm text-mist">
                  {t("settings.connected.connectedBadge")}
                </span>
              </span>
              {provider && list.length > 1 && (
                <Button
                  variant="ghost"
                  size="sm"
                  disabled={busy}
                  onClick={() => {
                    const name = SOCIAL_PROVIDER_NAMES[provider];
                    if (
                      window.confirm(t("settings.connected.disconnectConfirm", { provider: name }))
                    )
                      unlink.mutate(account);
                  }}
                >
                  {t("settings.connected.disconnect", {
                    provider: SOCIAL_PROVIDER_NAMES[provider],
                  })}
                </Button>
              )}
            </li>
          );
        })}
      </ul>
      {only && isSocialProvider(only.providerId) && (
        <p className="text-sm text-mist">{t("settings.connected.lastMethod")}</p>
      )}
      {offered.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {offered.map((provider) => (
            <Button
              key={provider}
              variant="outline"
              disabled={busy || accounts.isPending}
              onClick={() => link.mutate(provider)}
            >
              {t("settings.connected.connect", { provider: SOCIAL_PROVIDER_NAMES[provider] })}
            </Button>
          ))}
        </div>
      )}
      {message && (
        <p role="alert" className="rounded-2xl bg-sand p-3 text-sm text-ink">
          {message}
        </p>
      )}
    </Card>
  );
}
