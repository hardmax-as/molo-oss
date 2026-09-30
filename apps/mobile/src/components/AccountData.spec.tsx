import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Alert } from "react-native";
import { act, create } from "react-test-renderer";

import { AccountData } from "./AccountData.tsx";

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

const mockDelete = jest.fn(() => Promise.resolve({ ok: true }));
jest.mock("~/lib/api.ts", () => ({
  deleteAccount: () => mockDelete(),
  exportMyData: jest.fn(),
}));
jest.mock("~/lib/session.tsx", () => ({ useSignOut: () => () => Promise.resolve() }));
const mockNavigate = jest.fn();
jest.mock("expo-router", () => ({ useRouter: () => ({ navigate: mockNavigate }) }));
jest.mock("expo-file-system", () => ({ File: jest.fn(), Paths: {} }));
jest.mock("expo-sharing", () => ({}));
jest.mock("~/lib/i18n.tsx", () => ({
  useT: () => (key: string) => (key === "account.confirmWord" ? "SLETT" : key),
}));
jest.mock("~/ui/Card.tsx", () => {
  const { createElement } = jest.requireActual("react");
  return { Card: (props: object) => createElement("mock-card", props) };
});
jest.mock("~/ui/Button.tsx", () => {
  const { createElement } = jest.requireActual("react");
  return {
    Button: (props: { label: string; testID?: string; onPress: () => void }) =>
      createElement("mock-button", props),
  };
});

let mounted: ReturnType<typeof create> | null = null;

// Unmount inside act so no React Query notification lands after the test.
afterEach(async () => {
  await act(async () => mounted?.unmount());
  mounted = null;
});

async function render() {
  let tree!: ReturnType<typeof create>;
  await act(async () => {
    tree = create(
      <QueryClientProvider client={new QueryClient()}>
        <AccountData />
      </QueryClientProvider>,
    );
  });
  mounted = tree;
  const one = (id: string) => tree.root.find((n) => n.props.testID === id);
  return { one };
}

describe("AccountData deletion consent", () => {
  beforeEach(() => {
    mockDelete.mockClear();
    mockNavigate.mockClear();
  });

  it("stays disabled until the confirmation word is typed, whatever the email", async () => {
    const { one } = await render();
    expect(one("delete-account").props.disabled).toBe(true);
    await act(async () => one("delete-confirm-word").props.onChangeText("ada@example.com"));
    expect(one("delete-account").props.disabled).toBe(true);
    await act(async () => one("delete-confirm-word").props.onChangeText(" slett "));
    expect(one("delete-account").props.disabled).toBe(false);
  });

  it("asks once more before deleting", async () => {
    const alert = jest.spyOn(Alert, "alert").mockImplementation(() => undefined);
    const { one } = await render();
    await act(async () => one("delete-confirm-word").props.onChangeText("SLETT"));
    await act(async () => one("delete-account").props.onPress());
    expect(mockDelete).not.toHaveBeenCalled();
    const buttons = alert.mock.calls[0]?.[2] ?? [];
    await act(async () => buttons.find((b) => b.style === "destructive")?.onPress?.());
    expect(mockDelete).toHaveBeenCalledTimes(1);
    // The mutation's success path (sign out, "deleted", home) runs on later
    // ticks; let it finish while Alert is still mocked.
    await waitFor(() => expect(mockNavigate).toHaveBeenCalledWith("/"));
    alert.mockRestore();
  });
});
