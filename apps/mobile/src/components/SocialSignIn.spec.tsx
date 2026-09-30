import { act, create, type ReactTestInstance } from "react-test-renderer";

import { SocialSignIn, type SocialProblem } from "./SocialSignIn.tsx";

jest.mock("~/lib/i18n.tsx", () => ({
  useT: () => (key: string, values?: Record<string, string>) =>
    values?.["provider"] ? `${key}:${values["provider"]}` : key,
}));
// Host stand-ins: the pressable, animated button and Apple's native view are not under test.
jest.mock("~/ui/Button.tsx", () => {
  const { createElement } = jest.requireActual("react");
  return {
    Button: (props: { label: string; testID?: string; onPress: () => void }) =>
      createElement("mock-button", props),
  };
});
jest.mock("expo-apple-authentication", () => {
  const { createElement } = jest.requireActual("react");
  return {
    AppleAuthenticationButton: (props: object) => createElement("mock-apple-button", props),
    AppleAuthenticationButtonType: { SIGN_IN: 0, SIGN_UP: 2 },
    AppleAuthenticationButtonStyle: { BLACK: 2 },
  };
});

const both = { apple: true, google: true };

async function render(problem: SocialProblem | null, signup = false) {
  const onPress = jest.fn();
  let tree!: ReturnType<typeof create>;
  await act(async () => {
    tree = create(
      <SocialSignIn signup={signup} busy={false} show={both} problem={problem} onPress={onPress} />,
    );
  });
  const byTestID = (id: string) => tree.root.findAll((n) => n.props.testID === id);
  return { tree, onPress, byTestID };
}

/** Every string rendered inside a Text. */
function texts(root: ReactTestInstance): string {
  return root
    .findAll((n) => n.type === "Text")
    .flatMap((n) => n.children.filter((c): c is string => typeof c === "string"))
    .join("\n");
}

/** Depth-first order of the nodes carrying a testID, i.e. the order a screen reader walks. */
function order(root: ReactTestInstance): string[] {
  const out: string[] = [];
  const walk = (node: ReactTestInstance | string) => {
    if (typeof node === "string") return;
    if (typeof node.type === "string" && typeof node.props.testID === "string")
      out.push(node.props.testID);
    node.children.forEach(walk);
  };
  walk(root);
  return [...new Set(out)];
}

/**
 * TestFlight 0.0.3: Apple and Google on the sign-in tab failed with "no
 * account", and the message rendered in a card above the fold while the
 * buttons sat below it. The refusal now lives in the social block, after the
 * buttons, as an alert.
 */
describe("social sign-in errors", () => {
  it("shows a refusal under the buttons as an alert", async () => {
    const { tree, byTestID } = await render({
      provider: "apple",
      message: "auth.errors.notLinked",
    });
    const alert = byTestID("social-error").find((n) => typeof n.type === "string")!;
    expect(alert.props.accessibilityRole).toBe("alert");
    expect(alert.props.accessibilityLiveRegion).toBe("polite");
    expect(texts(tree.root)).toContain("auth.errors.notLinked");
    const ids = order(tree.root);
    expect(ids.indexOf("social-error")).toBeGreaterThan(ids.indexOf("sign-in-apple"));
    expect(ids.indexOf("social-error")).toBeGreaterThan(ids.indexOf("sign-in-google"));
  });

  it("never sends a new Apple or Google user to the sign-up tab: one tap creates the account", async () => {
    for (const signup of [false, true]) {
      const { tree, byTestID } = await render(
        { provider: "google", message: "auth.errors.generic" },
        signup,
      );
      expect(texts(tree.root)).toContain("auth.errors.generic");
      expect(byTestID("social-create-account")).toHaveLength(0);
    }
  });

  it("renders no alert when nothing went wrong, and forwards the tapped provider", async () => {
    const { byTestID, onPress } = await render(null);
    expect(byTestID("social-error")).toHaveLength(0);
    await act(async () => byTestID("sign-in-apple")[0]!.props.onPress());
    await act(async () => byTestID("sign-in-google")[0]!.props.onPress());
    expect(onPress.mock.calls).toEqual([["apple"], ["google"]]);
  });
});
