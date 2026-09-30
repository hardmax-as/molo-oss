import { expoClient } from "@better-auth/expo/client";
import { createAuthClient } from "better-auth/react";
import * as SecureStore from "expo-secure-store";

import { apiUrl } from "./api-url.ts";

/**
 * Better Auth client for React Native (@better-auth/expo 1.7.2). The Expo
 * plugin keeps the session cookie in SecureStore and replays it on every
 * auth request; `authClient.getCookie()` hands it to our own fetches.
 */
export const authClient = createAuthClient({
  baseURL: apiUrl(),
  basePath: "/api/auth",
  plugins: [
    expoClient({
      scheme: "molo",
      storagePrefix: "molo",
      storage: SecureStore,
    }),
  ],
});
