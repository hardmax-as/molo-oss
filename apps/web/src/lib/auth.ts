import { magicLinkClient } from "better-auth/client/plugins";
import { createAuthClient } from "better-auth/react";

import { apiUrl } from "./api.ts";

/** Better Auth client against apps/api (`/api/auth/*`). */
export const authClient = createAuthClient({
  baseURL: apiUrl(),
  basePath: "/api/auth",
  plugins: [magicLinkClient()],
  fetchOptions: { credentials: "include" },
});
