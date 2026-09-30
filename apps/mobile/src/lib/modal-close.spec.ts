import { closeModal } from "./modal-close.ts";

function fakeRouter(canGoBack: boolean) {
  const calls: string[] = [];
  return {
    calls,
    router: {
      canGoBack: () => canGoBack,
      back: () => calls.push("back"),
      replace: (href: "/") => calls.push(`replace ${href}`),
    },
  };
}

describe("closeModal", () => {
  it("goes back when the modal sits on another screen", () => {
    const { router, calls } = fakeRouter(true);
    expect(closeModal(router)).toBe("back");
    expect(calls).toEqual(["back"]);
  });

  it("lands on the path when the modal is the only screen", () => {
    // Onboarding replaces itself with the sign-up sheet; a cold deep link opens Plus.
    const { router, calls } = fakeRouter(false);
    expect(closeModal(router)).toBe("home");
    expect(calls).toEqual(["replace /"]);
  });
});
