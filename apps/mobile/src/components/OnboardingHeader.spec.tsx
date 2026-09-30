import { act, create } from "react-test-renderer";

import { OnboardingHeader } from "./OnboardingHeader.tsx";

/**
 * MOL-66: Skip on the first slide never fired on release builds. The layout
 * fix (clipping slide area, header above it, the mascot not touchable) needs
 * a device to verify; this pins the contract that pressing Skip finishes.
 */
describe("onboarding Skip", () => {
  it("calls finish when pressed", async () => {
    const onSkip = jest.fn();
    let tree!: ReturnType<typeof create>;
    await act(async () => {
      tree = create(<OnboardingHeader stepLabel="1 of 6" skipLabel="Skip" onSkip={onSkip} />);
    });
    const skip = tree.root.find(
      (node) => node.props.testID === "onboarding-skip" && typeof node.props.onPress === "function",
    );
    expect(skip.props.accessibilityRole).toBe("button");
    await act(async () => {
      skip.props.onPress();
    });
    expect(onSkip).toHaveBeenCalledTimes(1);
  });

  it("sits above the slide area in the z-order", async () => {
    let tree!: ReturnType<typeof create>;
    await act(async () => {
      tree = create(<OnboardingHeader stepLabel="1 of 6" skipLabel="Skip" onSkip={() => {}} />);
    });
    const styles = tree.root
      .findAll((node) => typeof node.type === "string" || typeof node.type === "object")
      .flatMap((node) => [node.props.style].flat())
      .filter(Boolean);
    expect(styles.some((s: { zIndex?: number }) => (s.zIndex ?? 0) >= 10)).toBe(true);
  });
});
