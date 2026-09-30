import { getSetCookie, storageAdapter } from "@better-auth/expo/client";
import { isUnlinkedSocialAccount, socialLinkError } from "@molo/core";
import * as AppleAuthentication from "expo-apple-authentication";
import * as Linking from "expo-linking";
import * as SecureStore from "expo-secure-store";
import * as WebBrowser from "expo-web-browser";

import { apiUrl } from "./api-url.ts";
import { authClient } from "./auth.ts";
import { appleUser, isAppleCancel, randomNonce, type SocialUser } from "./social-auth-logic.ts";

export type SocialResult = "signed-in" | "cancelled";
export type LinkResult = "linked" | "cancelled";

export class SocialAuthError extends Error {
  constructor(readonly code: string) {
    super(code);
  }
}

function providerError(error: {
  code?: string | undefined;
  message?: string | undefined;
}): SocialAuthError {
  if (isUnlinkedSocialAccount(error)) return new SocialAuthError("account_not_linked");
  return new SocialAuthError(error.code ?? "provider_error");
}

/** Translated by the auth screen; never render an OAuth query string as UI copy. */
export function socialErrorMessage(
  error: unknown,
): "auth.errors.notLinked" | "age.errors.invalid" | "auth.errors.generic" {
  if (error instanceof SocialAuthError && error.code === "account_not_linked")
    return "auth.errors.notLinked";
  if (error instanceof SocialAuthError && error.code === "AGE_REQUIREMENT")
    return "age.errors.invalid";
  return "auth.errors.generic";
}

/** Translated by Settings → Connected accounts. */
export function linkErrorMessage(
  error: unknown,
):
  | "settings.connected.errors.taken"
  | "settings.connected.errors.reauth"
  | "settings.connected.errors.unverified"
  | "settings.connected.lastMethod"
  | "auth.errors.generic" {
  const kind = socialLinkError(error instanceof SocialAuthError ? error : null);
  if (kind === "last") return "settings.connected.lastMethod";
  if (kind === "generic") return "auth.errors.generic";
  return `settings.connected.errors.${kind}`;
}

type AgeDeclaration = { birthYear: number; country: string; ageReached: boolean };

/**
 * Every sign-in may create the account: a new Apple or Google identity gets
 * one in this tap, and the app shows the age step next unless the sign-up
 * form already sent the declaration (docs/ARCHITECTURE.md, "Registration age
 * gate"). The server keeps `disableImplicitSignUp`, so only builds that can
 * show the age step ask for this.
 */
const ONE_TAP = { requestSignUp: true } as const;

/** The system Sign in with Apple sheet: an identity token bound to a fresh nonce. */
async function appleCredential(): Promise<
  | { token: string; nonce: string; user: SocialUser | null; authorizationCode: string | null }
  | "cancelled"
> {
  if (!(await AppleAuthentication.isAvailableAsync())) throw new Error("apple_unavailable");
  const nonce = randomNonce();
  let credential: AppleAuthentication.AppleAuthenticationCredential;
  try {
    credential = await AppleAuthentication.signInAsync({
      requestedScopes: [
        AppleAuthentication.AppleAuthenticationScope.FULL_NAME,
        AppleAuthentication.AppleAuthenticationScope.EMAIL,
      ],
      nonce,
    });
  } catch (e) {
    if (isAppleCancel(e)) return "cancelled";
    throw e;
  }
  if (!credential.identityToken) throw new Error("apple_no_token");
  return {
    token: credential.identityToken,
    nonce,
    user: appleUser(credential.fullName, credential.email),
    authorizationCode: credential.authorizationCode ?? null,
  };
}

/**
 * Hands the sheet's one-time authorization code to the API, which exchanges it
 * for a refresh token so that deleting the account can revoke the Apple grant
 * (App Store guideline 5.1.1(v)). The native id-token sign-in stores none on
 * its own. Best effort: sign-in has already succeeded, and nothing here may
 * undo it, so every failure is swallowed.
 */
async function sendAppleAuthorizationCode(code: string | null): Promise<void> {
  if (!code) return;
  try {
    const cookie = await authClient.getCookie();
    await fetch(`${apiUrl()}/me/apple/authorization-code`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...(cookie ? { Cookie: cookie } : {}) },
      body: JSON.stringify({ code }),
    });
  } catch {
    // Deletion then has no Apple token to revoke; the learner can still revoke in iOS Settings.
  }
}

/**
 * Native Sign in with Apple: the system sheet hands back an identity token,
 * which Better Auth verifies against Apple's keys (`signIn.social` with
 * `idToken`; the Expo client sends it straight to the server with no
 * browser round-trip). The server must list the app's bundle id as the
 * token audience (`APPLE_APP_BUNDLE_IDENTIFIER`).
 */
export async function signInWithApple(ageDeclaration?: AgeDeclaration): Promise<SocialResult> {
  const credential = await appleCredential();
  if (credential === "cancelled") return "cancelled";
  const { token, nonce, user, authorizationCode } = credential;
  const r = await authClient.signIn.social({
    provider: "apple",
    ...ONE_TAP,
    ...(ageDeclaration ? { additionalData: { ageDeclaration } } : {}),
    idToken: { token, nonce, ...(user ? { user } : {}) },
  });
  if (r.error) throw providerError(r.error);
  await sendAppleAuthorizationCode(authorizationCode);
  return "signed-in";
}

/**
 * Connect Apple to the signed-in account (Settings). The same native token as
 * sign-in, sent to `POST /link-social` with the session cookie; the server
 * accepts a different (private relay) address because the link is explicit.
 */
export async function linkApple(): Promise<LinkResult> {
  const credential = await appleCredential();
  if (credential === "cancelled") return "cancelled";
  const r = await authClient.linkSocial({
    provider: "apple",
    idToken: { token: credential.token, nonce: credential.nonce },
  });
  if (r.error) throw providerError(r.error);
  await sendAppleAuthorizationCode(credential.authorizationCode);
  return "linked";
}

/**
 * Open Google in the system browser through the Expo authorization proxy and
 * return the app URL the server redirected back to, checked against the
 * callback this flow created. `start` asks Better Auth for the Google URL
 * (sign-in or link) with the callback as both success and error target.
 */
async function googleBrowserFlow(
  path: "/auth" | "/settings",
  start: (callback: string) => Promise<{
    data?: { url?: string | undefined } | null;
    error?: { code?: string | undefined; message?: string | undefined } | null;
  }>,
): Promise<URL | "cancelled"> {
  const callback = Linking.createURL(path, {
    scheme: "molo",
    queryParams: { socialFlow: randomNonce() },
  });
  const r = await start(callback);
  if (r.error) throw providerError(r.error);
  if (!r.data?.url) throw new SocialAuthError("provider_error");
  const proxy = new URL("/api/auth/expo-authorization-proxy", apiUrl());
  proxy.searchParams.set("authorizationURL", r.data.url);
  // These are the two default cookie names used by the installed Expo plugin.
  const cookie = await authClient.getCookie();
  const state = cookie.match(/(?:^|;\s*)(?:__Secure-)?better-auth\.oauth_state=([^;]+)/)?.[1];
  if (state) proxy.searchParams.set("oauthState", state);
  const result = await WebBrowser.openAuthSessionAsync(proxy.toString(), callback);
  if (result.type !== "success") return "cancelled";
  const returned = new URL(result.url);
  const expected = new URL(callback);
  if (
    returned.protocol !== expected.protocol ||
    returned.host !== expected.host ||
    returned.pathname !== expected.pathname ||
    returned.searchParams.get("socialFlow") !== expected.searchParams.get("socialFlow")
  ) {
    throw new SocialAuthError("invalid_callback");
  }
  const error = returned.searchParams.get("error");
  if (error) throw providerError({ code: error });
  return returned;
}

/**
 * Own the browser result because Expo plugin 1.7.2 silently discards callback
 * errors without a cookie. Keep Better Auth's state proxy, cookie parser and
 * chunked SecureStore adapter; no new OAuth scopes or server endpoints.
 */
export async function signInWithGoogle(ageDeclaration?: AgeDeclaration): Promise<SocialResult> {
  const returned = await googleBrowserFlow("/auth", (callback) =>
    authClient.signIn.social({
      provider: "google",
      callbackURL: callback,
      errorCallbackURL: callback,
      disableRedirect: true,
      ...ONE_TAP,
      ...(ageDeclaration ? { additionalData: { ageDeclaration } } : {}),
    }),
  );
  if (returned === "cancelled") return "cancelled";
  const sessionCookie = returned.searchParams.get("cookie");
  if (!sessionCookie) throw new SocialAuthError("missing_session");
  const storage = storageAdapter(SecureStore);
  await storage.setItemAsync(
    "molo_cookie",
    getSetCookie(sessionCookie, (await storage.getItemAsync("molo_cookie")) ?? undefined),
  );
  authClient.$store.notify("$sessionSignal");
  return "signed-in";
}

/**
 * Connect Google to the signed-in account (Settings), through the same proxy
 * flow as sign-in. The session is unchanged, so any cookie the redirect
 * carries is ignored: the link is proven by the server's redirect without an
 * `error` code, and the caller refetches the account list.
 */
export async function linkGoogle(): Promise<LinkResult> {
  const returned = await googleBrowserFlow("/settings", (callback) =>
    authClient.linkSocial({
      provider: "google",
      callbackURL: callback,
      errorCallbackURL: callback,
      disableRedirect: true,
    }),
  );
  return returned === "cancelled" ? "cancelled" : "linked";
}
