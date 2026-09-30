import { mayPreview } from "@molo/core";
import { useQueryClient } from "@tanstack/react-query";
import { useEffect, useSyncExternalStore } from "react";

import { previewStore } from "./preview-state.ts";
import { useMe } from "./session.tsx";

export function usePreview() {
  const me = useMe();
  const qc = useQueryClient();
  const actorId = useSyncExternalStore(
    previewStore.subscribe,
    previewStore.getSnapshot,
    () => null,
  );
  const allowed = mayPreview(me.data);
  const enabled = allowed && actorId !== null && actorId === me.data?.user.id;
  useEffect(() => {
    if (!me.isPending && (!allowed || actorId !== me.data?.user.id)) {
      previewStore.set(null, false);
      qc.removeQueries({ queryKey: ["editor-preview"] });
    }
  }, [allowed, actorId, me.data?.user.id, me.isPending, qc]);
  return {
    allowed,
    enabled,
    actorId,
    setEnabled: (value: boolean) => {
      qc.removeQueries({ queryKey: ["editor-preview"] });
      previewStore.set(me.data, value);
      if (!value) void qc.invalidateQueries();
    },
  };
}
