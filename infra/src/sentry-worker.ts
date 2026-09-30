import {
  sentryEsbuildPlugin,
  type SentryEsbuildPluginOptions,
} from "@sentry/bundler-plugins/esbuild";
import type { BundleProps } from "alchemy/esbuild";

type Plugin = NonNullable<BundleProps["plugins"]>[number];

/** Alchemy 0.94 locates its entrypoint by exact metafile name after plugin hooks. */
export function sentryWorkerPlugins(options: SentryEsbuildPluginOptions): Plugin[] {
  return [
    sentryEsbuildPlugin(options),
    {
      name: "molo-sentry-entrypoint-metadata",
      setup(build) {
        build.onEnd((result) => {
          const suffix = "?sentryDebugIdProxy=true";
          for (const output of Object.values(result.metafile?.outputs ?? {})) {
            if (output.entryPoint?.endsWith(suffix))
              output.entryPoint = output.entryPoint.slice(0, -suffix.length);
          }
        });
      },
    },
  ];
}
