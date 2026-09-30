import type { QueryClient } from "@tanstack/react-query";
import { createRouter } from "@tanstack/react-router";

import { NotFound } from "./components/NotFound.tsx";
import { createQueryClient } from "./lib/query-client.ts";
import { routeTree } from "./routeTree.gen.ts";

export interface RouterContext {
  queryClient: QueryClient;
}

export function getRouter() {
  // Content cache times and the learner-state rules: src/lib/query-client.ts.
  const queryClient = createQueryClient();
  const router = createRouter({
    routeTree,
    context: { queryClient },
    // Hovering or touching a link runs the target route's loader, and the
    // learner routes' loaders prefetch their data into this client — in the
    // browser only, where the session cookie is (src/lib/prefetch.ts).
    defaultPreload: "intent",
    scrollRestoration: true,
    defaultNotFoundComponent: NotFound,
  });
  return router;
}

declare module "@tanstack/react-router" {
  interface Register {
    router: ReturnType<typeof getRouter>;
  }
}
