import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, create } from "react-test-renderer";

import { AccountSettings } from "./AccountSettings.tsx";

/** Re-checks `assert` inside act until it passes, for React Query's own ticks. */
async function waitFor(assert: () => void, timeoutMs = 2_000): Promise<void> {
  const until = Date.now() + timeoutMs;
  for (;;) {
    try {
      assert();
      return;
    } catch (e) {
      if (Date.now() > until) throw e;
    }
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 10));
    });
  }
}

let mounted: ReturnType<typeof create> | null = null;

// Unmount inside act so no React Query notification lands after the test.
afterEach(async () => {
  await act(async () => mounted?.unmount());
  mounted = null;
});

const mockUpdateUser = jest.fn();
const mockChangeEmail = jest.fn();
const mockChangePassword = jest.fn();
const mockSetFirstPassword = jest.fn();
const mockListAccounts = jest.fn();

jest.mock("~/lib/auth.ts", () => ({
  authClient: {
    updateUser: (body: unknown) => mockUpdateUser(body),
    changeEmail: (body: unknown) => mockChangeEmail(body),
    changePassword: (body: unknown) => mockChangePassword(body),
  },
}));
jest.mock("~/lib/api.ts", () => ({
  ApiError: class ApiError extends Error {
    code: string;
    constructor(_status: number, code: string) {
      super(code);
      this.code = code;
    }
  },
  setFirstPassword: (password: string) => mockSetFirstPassword(password),
}));
jest.mock("~/components/ConnectedAccounts.tsx", () => ({
  listAccounts: () => mockListAccounts(),
}));
jest.mock("~/lib/announce.ts", () => ({ useAnnounce: () => undefined }));
jest.mock("~/lib/i18n.tsx", () => ({
  useT: () => (key: string, vars?: Record<string, unknown>) =>
    vars ? `${key} ${JSON.stringify(vars)}` : key,
}));
jest.mock("~/ui/theme.ts", () => ({ colors: { mistSoft: "#999" } }));
jest.mock("~/ui/Card.tsx", () => {
  const { createElement } = jest.requireActual("react");
  return { Card: (props: object) => createElement("mock-card", props) };
});
jest.mock("~/ui/Switch.tsx", () => {
  const { createElement } = jest.requireActual("react");
  return { Switch: (props: object) => createElement("mock-switch", props) };
});
jest.mock("~/ui/Button.tsx", () => {
  const { createElement } = jest.requireActual("react");
  return {
    Button: (props: { label: string; testID?: string; onPress: () => void }) =>
      createElement("mock-button", props),
  };
});

async function render(providers: string[] = ["credential"]) {
  mockListAccounts.mockResolvedValue(
    providers.map((providerId, i) => ({ id: `a${i}`, providerId })),
  );
  let tree!: ReturnType<typeof create>;
  await act(async () => {
    tree = create(
      <QueryClientProvider
        client={
          // No retries and no garbage-collection timers left running after the test.
          new QueryClient({
            defaultOptions: {
              queries: { retry: false, gcTime: Infinity },
              mutations: { gcTime: Infinity },
            },
          })
        }
      >
        <AccountSettings name="Thandi Mbeki" email="thandi@example.com" />
      </QueryClientProvider>,
    );
  });
  mounted = tree;
  // React Query delivers the account list on its own tick.
  await waitFor(() => expect(mockListAccounts).toHaveBeenCalled());
  await waitFor(() =>
    expect(
      tree.root.findAll(
        (n) => n.props.testID === "password-change" || n.props.testID === "password-set",
      ).length,
    ).toBeGreaterThan(0),
  );
  // The outermost element carrying the id: a host Text repeats its testID below it.
  const one = (id: string) => {
    const found = tree.root.findAll((n) => n.props.testID === id)[0];
    if (!found) throw new Error(`no element with testID ${id}`);
    return found;
  };
  const has = (id: string) => tree.root.findAll((n) => n.props.testID === id).length > 0;
  const text = (id: string) => String(one(id).props.children);
  return { one, has, text };
}

beforeEach(() => {
  for (const m of [
    mockUpdateUser,
    mockChangeEmail,
    mockChangePassword,
    mockSetFirstPassword,
    mockListAccounts,
  ])
    m.mockReset();
  mockUpdateUser.mockResolvedValue({ data: { status: true }, error: null });
  mockChangeEmail.mockResolvedValue({ data: { status: true }, error: null });
  mockChangePassword.mockResolvedValue({ data: {}, error: null });
  mockSetFirstPassword.mockResolvedValue({ ok: true });
});

describe("AccountSettings name", () => {
  it("refuses a blank name and saves a trimmed one", async () => {
    const { one, has } = await render();
    expect(one("account-name-save").props.disabled).toBe(true);
    await act(async () => one("account-name").props.onChangeText("   "));
    expect(has("account-name-error")).toBe(true);
    expect(one("account-name-save").props.disabled).toBe(true);
    await act(async () => one("account-name").props.onChangeText("  Thandi M "));
    expect(has("account-name-error")).toBe(false);
    await act(async () => one("account-name-save").props.onPress());
    await waitFor(() => expect(mockUpdateUser).toHaveBeenCalledWith({ name: "Thandi M" }));
    await waitFor(() => expect(has("account-name-saved")).toBe(true));
  });

  it("says why the server refused the name", async () => {
    mockUpdateUser.mockResolvedValue({ data: null, error: { code: "INVALID_NAME" } });
    const { one, text } = await render();
    await act(async () => one("account-name").props.onChangeText("Thandi M"));
    await act(async () => one("account-name-save").props.onPress());
    await waitFor(() => expect(text("account-name-error")).toBe("settings.profile.nameInvalid"));
  });
});

describe("AccountSettings e-mail", () => {
  it("does not send for the current address or a malformed one", async () => {
    const { one, text } = await render();
    await act(async () => one("account-new-email").props.onChangeText("Thandi@Example.com"));
    await act(async () => one("account-email-send").props.onPress());
    expect(text("account-email-error")).toBe("settings.profile.emailSame");
    await act(async () => one("account-new-email").props.onChangeText("not-an-email"));
    await act(async () => one("account-email-send").props.onPress());
    expect(text("account-email-error")).toBe("settings.profile.emailInvalid");
    expect(mockChangeEmail).not.toHaveBeenCalled();
  });

  it("asks Better Auth to mail the new address and says where to look", async () => {
    const { one, text } = await render();
    await act(async () => one("account-new-email").props.onChangeText(" New@Example.com "));
    await act(async () => one("account-email-send").props.onPress());
    await waitFor(() =>
      expect(mockChangeEmail).toHaveBeenCalledWith({ newEmail: "new@example.com" }),
    );
    await waitFor(() => expect(text("account-email-sent")).toContain("new@example.com"));
  });
});

describe("AccountSettings password", () => {
  it("changes a password with the current one and signs out other devices by default", async () => {
    const { one, has } = await render(["credential", "google"]);
    expect(has("password-change")).toBe(true);
    await act(async () => one("current-password").props.onChangeText("old-password-1"));
    await act(async () => one("new-password").props.onChangeText("new-password-22"));
    await act(async () => one("password-save").props.onPress());
    await waitFor(() => expect(mockChangePassword).toHaveBeenCalled());
    expect(mockChangePassword).toHaveBeenCalledWith({
      currentPassword: "old-password-1",
      newPassword: "new-password-22",
      revokeOtherSessions: true,
    });
    await waitFor(() => expect(has("password-done")).toBe(true));
  });

  it("says when the current password is wrong", async () => {
    mockChangePassword.mockResolvedValue({ data: null, error: { code: "INVALID_PASSWORD" } });
    const { one, text } = await render();
    await act(async () => one("current-password").props.onChangeText("wrong-password"));
    await act(async () => one("new-password").props.onChangeText("new-password-22"));
    await act(async () => one("password-save").props.onPress());
    await waitFor(() => expect(text("password-error")).toBe("settings.profile.passwordWrong"));
  });

  it("refuses a short new password before asking the server", async () => {
    const { one, text } = await render();
    await act(async () => one("current-password").props.onChangeText("old-password-1"));
    await act(async () => one("new-password").props.onChangeText("short"));
    await act(async () => one("password-save").props.onPress());
    expect(text("password-error")).toContain("settings.profile.passwordShort");
    expect(mockChangePassword).not.toHaveBeenCalled();
  });

  it("offers an Apple/Google-only account a first password instead", async () => {
    const { one, has } = await render(["apple"]);
    expect(has("password-set")).toBe(true);
    expect(has("current-password")).toBe(false);
    await act(async () => one("new-password").props.onChangeText("first-password-1"));
    await act(async () => one("password-save").props.onPress());
    await waitFor(() => expect(mockSetFirstPassword).toHaveBeenCalledWith("first-password-1"));
    expect(mockChangePassword).not.toHaveBeenCalled();
  });
});
