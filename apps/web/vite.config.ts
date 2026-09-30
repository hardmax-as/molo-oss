import { fileURLToPath } from "node:url";

import { cloudflare } from "@cloudflare/vite-plugin";
import { sentryVitePlugin } from "@sentry/vite-plugin";
import tailwindcss from "@tailwindcss/vite";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import viteReact from "@vitejs/plugin-react";
import { defineConfig, type Plugin } from "vite";

import { sentryBuildOptions } from "../../infra/src/sentry-build.ts";

const sentry = sentryBuildOptions("molo-web", process.env);

/**
 * One id per build: the release SHA on a deploy, a timestamp otherwise. It is
 * baked into the bundle and written to `/build.json`, so an open editor page
 * can tell that a newer build is being served (src/lib/build-version.ts). The
 * prefix keeps it distinct from the bare SHA Sentry also inlines, so the
 * artifact check (infra/src/assert-web-artifacts.ts) finds this define.
 */
const BUILD_ID = `molo-build-${process.env["SENTRY_RELEASE"]?.trim() || `local-${Date.now().toString(36)}`}`;

function buildStamp(id: string): Plugin {
  return {
    name: "molo-build-stamp",
    apply: "build",
    // The browser's assets only; the Worker bundle needs no file.
    applyToEnvironment: (environment) => environment.name === "client",
    generateBundle() {
      this.emitFile({
        type: "asset",
        fileName: "build.json",
        source: `${JSON.stringify({ build: id })}\n`,
      });
    },
  };
}

// TanStack Start on Cloudflare Workers (docs: framework/react/guide/hosting).
export default defineConfig({
  plugins: [
    cloudflare({ viteEnvironment: { name: "ssr" } }),
    tanstackStart({ srcDirectory: "src", router: { routesDirectory: "routes" } }),
    viteReact(),
    tailwindcss(),
    buildStamp(BUILD_ID),
    ...(sentry ? sentryVitePlugin(sentry) : []),
  ],
  define: { "import.meta.env.VITE_MOLO_BUILD": JSON.stringify(BUILD_ID) },
  build: { sourcemap: sentry ? "hidden" : false },
  resolve: { alias: { "~": fileURLToPath(new URL("./src", import.meta.url)) } },
  server: { port: 3300 },
});
