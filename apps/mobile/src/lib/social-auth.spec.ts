import {
  linkApple,
  linkErrorMessage,
  linkGoogle,
  signInWithApple,
  signInWithGoogle,
  SocialAuthError,
  socialErrorMessage,
} from "./social-auth.ts";

const mockSocial = jest.fn();
const mockLink = jest.fn();
const mockGetCookie = jest.fn();
const mockNotify = jest.fn();
const mockOpen = jest.fn();
const mockApple = jest.fn();
const mockReadStorage = jest.fn();
const mockWriteStorage = jest.fn();
const mockCookieMerge = jest.fn();

jest.mock("./auth.ts", () => ({
  authClient: {
    signIn: { social: (...args: unknown[]) => mockSocial(...args) },
    linkSocial: (...args: unknown[]) => mockLink(...args),
    getCookie: (...args: unknown[]) => mockGetCookie(...args),
    $store: { notify: (...args: unknown[]) => mockNotify(...args) },
  },
}));
jest.mock("./api-url.ts", () => ({ apiUrl: () => "https://molo.test" }));
jest.mock("@better-auth/expo/client", () => ({
  getSetCookie: (...args: unknown[]) => mockCookieMerge(...args),
  storageAdapter: () => ({
    getItemAsync: (...args: unknown[]) => mockReadStorage(...args),
    setItemAsync: (...args: unknown[]) => mockWriteStorage(...args),
  }),
}));
jest.mock("expo-linking", () => ({
  createURL: (path: string, options: { queryParams: { socialFlow: string } }) =>
    `molo:/${path}?socialFlow=${options.queryParams.socialFlow}`,
}));
jest.mock("expo-web-browser", () => ({
  openAuthSessionAsync: (...args: unknown[]) => mockOpen(...args),
}));
jest.mock("expo-apple-authentication", () => ({
  isAvailableAsync: async () => true,
  signInAsync: (...args: unknown[]) => mockApple(...args),
  AppleAuthenticationScope: { FULL_NAME: 0, EMAIL: 1 },
}));
jest.mock("expo-secure-store", () => ({}));

const declaration = { birthYear: 1990, country: "ZA", ageReached: false };
beforeEach(() => {
  jest.clearAllMocks();
  mockSocial.mockResolvedValue({
    data: { url: "https://accounts.google.com/o/oauth2/auth?state=state-fixture" },
    error: null,
  });
  mockLink.mockResolvedValue({
    data: { url: "https://accounts.google.com/o/oauth2/auth?state=state-fixture" },
    error: null,
  });
  mockGetCookie.mockResolvedValue("__Secure-better-auth.oauth_state=state-cookie-fixture");
  mockOpen.mockResolvedValue({ type: "cancel" });
  mockApple.mockResolvedValue({
    identityToken: "apple-id-token-fixture",
    fullName: null,
    email: null,
  });
  mockReadStorage.mockResolvedValue("previous-cookie-fixture");
  mockCookieMerge.mockReturnValue("merged-cookie-fixture");
  mockWriteStorage.mockResolvedValue(undefined);
});

describe("social-auth.ts", () => {
  it("asks for sign-up on every Google tap, without an age declaration from the sign-in tab", async () => {
    await signInWithGoogle();
    expect(mockSocial.mock.calls[0]?.[0]).toMatchObject({
      provider: "google",
      requestSignUp: true,
    });
    expect(mockSocial.mock.calls[0]?.[0]).not.toHaveProperty("additionalData");
  });

  it("reports a callback error as an error, never as cancellation", async () => {
    mockOpen.mockImplementation(async (_url: string, callback: string) => ({
      type: "success",
      url: `${callback}&error=signup_disabled`,
    }));
    const error = await signInWithGoogle().catch((e: unknown) => e);
    expect(socialErrorMessage(error)).toBe("auth.errors.generic");
    expect(mockWriteStorage).not.toHaveBeenCalled();
    expect(mockNotify).not.toHaveBeenCalled();
  });

  it("sends the sign-up tab's declaration with Google and keeps the existing OAuth state proxy", async () => {
    await signInWithGoogle(declaration);
    expect(mockSocial).toHaveBeenCalledWith(
      expect.objectContaining({
        provider: "google",
        requestSignUp: true,
        additionalData: { ageDeclaration: declaration },
        disableRedirect: true,
      }),
    );
    const [url, callback] = mockOpen.mock.calls[0]!;
    const proxy = new URL(url);
    expect(proxy.pathname).toBe("/api/auth/expo-authorization-proxy");
    expect(proxy.searchParams.get("oauthState")).toBe("state-cookie-fixture");
    expect(proxy.searchParams.get("authorizationURL")).toContain("accounts.google.com");
    expect(mockSocial.mock.calls[0]?.[0].errorCallbackURL).toBe(callback);
  });

  it("uses the library's cookie storage helpers for a successful existing Google account", async () => {
    mockOpen.mockImplementation(async (_url: string, callback: string) => ({
      type: "success",
      url: `${callback}&cookie=${encodeURIComponent("better-auth.session_token=session-fixture")}`,
    }));
    await expect(signInWithGoogle()).resolves.toBe("signed-in");
    expect(mockCookieMerge).toHaveBeenCalledWith(
      "better-auth.session_token=session-fixture",
      "previous-cookie-fixture",
    );
    expect(mockWriteStorage).toHaveBeenCalledWith("molo_cookie", "merged-cookie-fixture");
    expect(mockNotify).toHaveBeenCalledWith("$sessionSignal");
  });

  it("keeps dismissal distinct from an error", async () => {
    await expect(signInWithGoogle()).resolves.toBe("cancelled");
    expect(mockWriteStorage).not.toHaveBeenCalled();
  });

  it("rejects a callback from another flow before storing a cookie", async () => {
    mockOpen.mockResolvedValue({
      type: "success",
      url: "molo://auth?socialFlow=wrong-flow&cookie=untrusted",
    });
    await expect(signInWithGoogle()).rejects.toMatchObject({ code: "invalid_callback" });
    expect(mockWriteStorage).not.toHaveBeenCalled();
  });

  it("reports a successful browser return without a session as an error", async () => {
    mockOpen.mockImplementation(async (_url: string, callback: string) => ({
      type: "success",
      url: callback,
    }));
    await expect(signInWithGoogle()).rejects.toMatchObject({ code: "missing_session" });
  });

  it("asks for sign-up on every Apple tap, so a new Apple ID gets its account at once", async () => {
    mockSocial.mockResolvedValue({ data: { redirect: false }, error: null });
    await expect(signInWithApple()).resolves.toBe("signed-in");
    expect(mockSocial.mock.calls[0]?.[0]).toMatchObject({ provider: "apple", requestSignUp: true });
    expect(mockSocial.mock.calls[0]?.[0]).not.toHaveProperty("additionalData");
  });

  it("sends the sign-up tab's declaration with Apple and adds no scopes", async () => {
    await signInWithApple(declaration);
    expect(mockSocial).toHaveBeenCalledWith(
      expect.objectContaining({
        provider: "apple",
        requestSignUp: true,
        additionalData: { ageDeclaration: declaration },
      }),
    );
    expect(mockApple).toHaveBeenCalledWith(expect.objectContaining({ requestedScopes: [0, 1] }));
  });

  it("retains the server's age refusal", async () => {
    mockSocial.mockResolvedValue({ error: { code: "AGE_REQUIREMENT", message: "invalid" } });
    const error = await signInWithApple(declaration).catch((e: unknown) => e);
    expect(socialErrorMessage(error)).toBe("age.errors.invalid");
  });

  it("maps an existing, unconnected account to the connect-in-Settings message", async () => {
    mockSocial.mockResolvedValue({
      error: { code: "OAUTH_LINK_ERROR", message: "account not linked" },
    });
    const error = await signInWithApple().catch((e: unknown) => e);
    expect(socialErrorMessage(error)).toBe("auth.errors.notLinked");
  });
});

describe("connecting a provider from Settings", () => {
  it("links Apple with the native token and nonce, and never asks to sign up", async () => {
    mockLink.mockResolvedValue({ data: { status: true }, error: null });
    await expect(linkApple()).resolves.toBe("linked");
    const body = mockLink.mock.calls[0]?.[0];
    expect(body).toMatchObject({ provider: "apple", idToken: { token: "apple-id-token-fixture" } });
    expect(body.idToken.nonce).toEqual(mockApple.mock.calls[0]?.[0].nonce);
    expect(body).not.toHaveProperty("requestSignUp");
    expect(mockSocial).not.toHaveBeenCalled();
  });
  it("treats a dismissed Apple sheet as cancelled, not as an error", async () => {
    mockApple.mockRejectedValue(
      Object.assign(new Error("cancel"), { code: "ERR_REQUEST_CANCELED" }),
    );
    await expect(linkApple()).resolves.toBe("cancelled");
    expect(mockLink).not.toHaveBeenCalled();
  });

  it("reports an Apple ID that belongs to another account", async () => {
    mockLink.mockResolvedValue({ error: { code: "SOCIAL_ACCOUNT_ALREADY_LINKED" } });
    const error = await linkApple().catch((e: unknown) => e);
    expect(linkErrorMessage(error)).toBe("settings.connected.errors.taken");
  });

  it("links Google through the same proxy, back to Settings, without touching the session cookie", async () => {
    mockOpen.mockImplementation(async (_url: string, callback: string) => ({
      type: "success",
      url: `${callback}&cookie=${encodeURIComponent("better-auth.oauth_state=; Max-Age=0")}`,
    }));
    await expect(linkGoogle()).resolves.toBe("linked");
    const body = mockLink.mock.calls[0]?.[0];
    expect(body).toMatchObject({ provider: "google", disableRedirect: true });
    expect(new URL(body.callbackURL).host).toBe("settings");
    expect(body.errorCallbackURL).toBe(body.callbackURL);
    const proxy = new URL(mockOpen.mock.calls[0]![0]);
    expect(proxy.pathname).toBe("/api/auth/expo-authorization-proxy");
    expect(proxy.searchParams.get("oauthState")).toBe("state-cookie-fixture");
    expect(mockWriteStorage).not.toHaveBeenCalled();
    expect(mockNotify).not.toHaveBeenCalled();
  });

  it("surfaces the callback's link error code", async () => {
    mockOpen.mockImplementation(async (_url: string, callback: string) => ({
      type: "success",
      url: `${callback}&error=account_already_linked_to_different_user`,
    }));
    const error = await linkGoogle().catch((e: unknown) => e);
    expect(linkErrorMessage(error)).toBe("settings.connected.errors.taken");
  });

  it("asks for a fresh sign-in when the session is too old to unlink, and names the last method", () => {
    expect(linkErrorMessage(new SocialAuthError("SESSION_NOT_FRESH"))).toBe(
      "settings.connected.errors.reauth",
    );
    expect(linkErrorMessage(new SocialAuthError("FAILED_TO_UNLINK_LAST_ACCOUNT"))).toBe(
      "settings.connected.lastMethod",
    );
    expect(linkErrorMessage(new Error("apple_unavailable"))).toBe("auth.errors.generic");
  });
});

describe("the native Apple authorization code", () => {
  const mockFetch = jest.fn();
  const withCode = {
    identityToken: "apple-id-token-fixture",
    authorizationCode: "apple-code-fixture",
    fullName: null,
    email: null,
  };
  beforeEach(() => {
    mockFetch.mockReset();
    global.fetch = mockFetch as unknown as typeof fetch;
    mockGetCookie.mockResolvedValue("better-auth.session_token=session-fixture");
  });

  it("goes to the API after sign-in, with the session cookie, so deletion can revoke it", async () => {
    mockSocial.mockResolvedValue({ data: {}, error: null });
    mockApple.mockResolvedValue(withCode);
    mockFetch.mockResolvedValue({ ok: true });
    await expect(signInWithApple()).resolves.toBe("signed-in");
    expect(mockFetch).toHaveBeenCalledWith("https://molo.test/me/apple/authorization-code", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Cookie: "better-auth.session_token=session-fixture",
      },
      body: JSON.stringify({ code: "apple-code-fixture" }),
    });
  });

  it("never turns a signed-in or linked result into a failure", async () => {
    mockSocial.mockResolvedValue({ data: {}, error: null });
    mockLink.mockResolvedValue({ data: { status: true }, error: null });
    mockApple.mockResolvedValue(withCode);
    mockFetch.mockRejectedValue(new Error("offline"));
    await expect(signInWithApple()).resolves.toBe("signed-in");
    await expect(linkApple()).resolves.toBe("linked");
    expect(mockFetch).toHaveBeenCalledTimes(2);
  });

  it("sends nothing when the sheet returned no code, or sign-in failed", async () => {
    mockSocial.mockResolvedValue({ data: {}, error: null });
    await signInWithApple();
    mockSocial.mockResolvedValue({ error: { code: "INVALID_TOKEN" } });
    mockApple.mockResolvedValue(withCode);
    await signInWithApple().catch(() => undefined);
    expect(mockFetch).not.toHaveBeenCalled();
  });
});
