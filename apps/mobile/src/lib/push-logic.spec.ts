import {
  disablePush,
  enablePush,
  pushPlatform,
  pushToggle,
  routeFromNotification,
  syncPush,
  type PushPermission,
  type PushPorts,
  type PushRegistration,
  type PushState,
} from "./push-logic.ts";

/**
 * `async`/`await` is avoided here for the same reason as in push-logic.ts:
 * `@babel/runtime` is not resolvable from apps/mobile, so an async function
 * makes the suite fail to load (the library notes).
 */

interface Fake extends PushPorts {
  readonly calls: string[];
  readonly registered: PushRegistration[];
  readonly unregistered: (string | null)[];
}

function ports(
  opts: {
    isDevice?: boolean;
    permission?: PushPermission;
    afterRequest?: PushPermission;
    token?: string | null;
    appVersion?: string | null;
  } = {},
): Fake {
  const calls: string[] = [];
  const registered: PushRegistration[] = [];
  const unregistered: (string | null)[] = [];
  let permission = opts.permission ?? "undetermined";
  return {
    calls,
    registered,
    unregistered,
    isDevice: opts.isDevice ?? true,
    platform: "ios",
    appVersion: opts.appVersion === undefined ? "0.0.1" : opts.appVersion,
    getPermission: () => {
      calls.push("getPermission");
      return Promise.resolve(permission);
    },
    requestPermission: () => {
      calls.push("requestPermission");
      permission = opts.afterRequest ?? "granted";
      return Promise.resolve(permission);
    },
    getToken: () => {
      calls.push("getToken");
      return Promise.resolve(opts.token === undefined ? "ExponentPushToken[abc]" : opts.token);
    },
    register: (r) => {
      calls.push("register");
      registered.push(r);
      return Promise.resolve();
    },
    unregister: (t) => {
      calls.push("unregister");
      unregistered.push(t);
      return Promise.resolve();
    },
    prepareChannel: () => {
      calls.push("prepareChannel");
      return Promise.resolve();
    },
  };
}

describe("turning push reminders on", () => {
  it("asks once, prepares the channel and registers the token", () => {
    const p = ports();
    return enablePush(p).then((state) => {
      expect(state).toEqual({
        supported: true,
        permission: "granted",
        token: "ExponentPushToken[abc]",
      });
      expect(p.calls).toEqual([
        "getPermission",
        "requestPermission",
        "prepareChannel",
        "getToken",
        "register",
      ]);
      expect(p.registered).toEqual([
        { token: "ExponentPushToken[abc]", platform: "ios", appVersion: "0.0.1" },
      ]);
      return null;
    });
  });

  it("does not ask again when permission is already granted", () => {
    const p = ports({ permission: "granted" });
    return enablePush(p).then(() => {
      expect(p.calls).not.toContain("requestPermission");
      return null;
    });
  });

  it("registers nothing when the person says no", () => {
    const p = ports({ afterRequest: "denied" });
    return enablePush(p).then((state) => {
      expect(state).toEqual({ supported: true, permission: "denied", token: null });
      expect(p.registered).toEqual([]);
      return null;
    });
  });

  it("registers nothing on a simulator", () => {
    const p = ports({ isDevice: false });
    return enablePush(p).then((state) => {
      expect(state).toEqual({ supported: false, permission: "undetermined", token: null });
      expect(p.calls).toEqual([]);
      return null;
    });
  });

  it("leaves the token null when the build has no push credentials", () => {
    const p = ports({ token: null });
    return enablePush(p).then((state) => {
      expect(state.token).toBeNull();
      expect(p.registered).toEqual([]);
      return null;
    });
  });

  it("omits the app version when the build does not report one", () => {
    const p = ports({ appVersion: null });
    return enablePush(p).then(() => {
      expect(p.registered[0]).toEqual({ token: "ExponentPushToken[abc]", platform: "ios" });
      return null;
    });
  });
});

describe("refreshing the token on app start", () => {
  it("re-registers silently when permission is already granted", () => {
    const p = ports({ permission: "granted" });
    return syncPush(p).then((state) => {
      expect(state.token).toBe("ExponentPushToken[abc]");
      expect(p.calls).not.toContain("requestPermission");
      expect(p.registered).toHaveLength(1);
      return null;
    });
  });

  it("never prompts when permission has not been asked for", () => {
    const p = ports({ permission: "undetermined" });
    return syncPush(p).then((state) => {
      expect(state).toEqual({ supported: true, permission: "undetermined", token: null });
      expect(p.calls).toEqual(["getPermission"]);
      return null;
    });
  });

  it("stays quiet on a simulator", () => {
    const p = ports({ isDevice: false });
    return syncPush(p).then((state) => {
      expect(state).toEqual({ supported: false, permission: "undetermined", token: null });
      expect(p.calls).toEqual([]);
      return null;
    });
  });
});

describe("turning push reminders off", () => {
  it("withdraws exactly this device's token", () => {
    const p = ports();
    return enablePush(p)
      .then((on) => disablePush(p, on))
      .then((off) => {
        expect(off).toEqual({ supported: true, permission: "granted", token: null });
        expect(p.unregistered).toEqual(["ExponentPushToken[abc]"]);
        return null;
      });
  });

  it("calls nothing when the device was never registered", () => {
    const p = ports();
    const state: PushState = { supported: true, permission: "granted", token: null };
    return disablePush(p, state).then((after) => {
      expect(after).toEqual(state);
      expect(p.calls).toEqual([]);
      return null;
    });
  });
});

describe("the Settings row", () => {
  it("explains a simulator rather than offering a switch that cannot work", () => {
    expect(pushToggle({ supported: false, permission: "undetermined", token: null })).toEqual({
      on: false,
      note: "simulator",
    });
  });

  it("points at the phone's settings once notifications are denied", () => {
    expect(pushToggle({ supported: true, permission: "denied", token: null })).toEqual({
      on: false,
      note: "denied",
    });
  });

  it("is on only while a token is registered", () => {
    expect(pushToggle({ supported: true, permission: "granted", token: "t" })).toEqual({
      on: true,
      note: null,
    });
    expect(pushToggle({ supported: true, permission: "granted", token: null })).toEqual({
      on: false,
      note: null,
    });
  });

  it("reports a failed attempt without claiming the switch is on", () => {
    expect(pushToggle({ supported: true, permission: "granted", token: null }, true)).toEqual({
      on: false,
      note: "failed",
    });
  });
});

describe("a tapped reminder", () => {
  it("opens the review tab", () => {
    expect(routeFromNotification({ route: "/review" })).toBe("/review");
    expect(routeFromNotification({ route: "review" })).toBe("/review");
  });

  it("ignores anything the app does not already know", () => {
    expect(routeFromNotification({ route: "/edit/lexemes" })).toBeNull();
    expect(routeFromNotification({ route: "https://example.com" })).toBeNull();
    expect(routeFromNotification({ route: 7 })).toBeNull();
    expect(routeFromNotification({})).toBeNull();
    expect(routeFromNotification(null)).toBeNull();
    expect(routeFromNotification(undefined)).toBeNull();
  });
});

describe("platforms", () => {
  it("pushes to phones only", () => {
    expect(pushPlatform("ios")).toBe("ios");
    expect(pushPlatform("android")).toBe("android");
    expect(pushPlatform("web")).toBeNull();
  });
});
