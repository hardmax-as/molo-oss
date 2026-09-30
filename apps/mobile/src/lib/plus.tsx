import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";

import { accountReady } from "./age-step.ts";
import { currentPlus, purchasesEnabled, syncPurchasesUser } from "./purchases.ts";
import { useMe } from "./session.tsx";

interface PlusCtx {
  /** The store says Plus is active on this device, even before the server's webhook lands. */
  localPlus: boolean;
  setLocalPlus: (on: boolean) => void;
}

const Ctx = createContext<PlusCtx>({ localPlus: false, setLocalPlus: () => undefined });

/** Keeps RevenueCat's customer in step with the signed-in user and remembers a fresh purchase. */
export function PlusProvider({ children }: { children: ReactNode }) {
  const me = useMe();
  const [localPlus, setLocalPlus] = useState(false);
  // The store customer follows the account only once it is past the age step.
  const userId = accountReady(me.data) ? me.data.user.id : null;
  useEffect(() => {
    if (!purchasesEnabled()) return;
    void syncPurchasesUser(userId)
      .then(() => currentPlus())
      .then(setLocalPlus);
  }, [userId]);
  const value = useMemo(() => ({ localPlus, setLocalPlus }), [localPlus]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function usePlus(): PlusCtx & { plan: "free" | "plus" } {
  const ctx = useContext(Ctx);
  const me = useMe();
  const serverPlus = me.data?.plan?.plan === "plus";
  // An explicit withdrawal overrides a stale store cache while its refund is processed.
  const localPlus = ctx.localPlus && !me.data?.plan?.withdrawn;
  return { ...ctx, localPlus, plan: serverPlus || localPlus ? "plus" : "free" };
}
