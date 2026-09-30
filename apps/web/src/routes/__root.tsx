import { QueryClientProvider } from "@tanstack/react-query";
import {
  HeadContent,
  Outlet,
  Scripts,
  createRootRouteWithContext,
  useRouter,
} from "@tanstack/react-router";
import { useEffect, useState, type ReactNode } from "react";
import { Toaster } from "sonner";

import { Layout } from "~/components/Layout.tsx";
import { I18nProvider, detectLanguage } from "~/lib/i18n.tsx";
import { hydrateMotionOverride } from "~/lib/motion.ts";
import { startSentry } from "~/lib/sentry.ts";
import { canonicalUrl, siteMeta } from "~/lib/seo.ts";
import { SfxProvider } from "~/lib/sfx.tsx";
import { registerServiceWorker } from "~/lib/sw.ts";
import type { RouterContext } from "~/router.tsx";

import appCss from "~/styles.css?url";

export const Route = createRootRouteWithContext<RouterContext>()({
  head: ({ matches }) => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1" },
      { name: "theme-color", content: "#FFF7E8" },
      ...siteMeta(),
    ],
    links: [
      { rel: "stylesheet", href: appCss },
      // The deepest match is the page; the canonical is its path on the
      // public origin, so www., trailing slashes and query strings never
      // become a second copy of a page in an index.
      { rel: "canonical", href: canonicalUrl(matches[matches.length - 1]?.pathname ?? "/") },
      // The SVG is the icon everywhere it is understood; the PNGs are for
      // browsers and home screens that want a raster, and the manifest turns
      // the site into an installable app (packages/brand/presskit).
      { rel: "icon", href: "/favicon.svg", type: "image/svg+xml" },
      { rel: "icon", href: "/favicon-32.png", type: "image/png", sizes: "32x32" },
      { rel: "icon", href: "/favicon-16.png", type: "image/png", sizes: "16x16" },
      { rel: "apple-touch-icon", href: "/apple-touch-icon-180.png", sizes: "180x180" },
      { rel: "manifest", href: "/site.webmanifest" },
    ],
  }),
  component: RootComponent,
});

function RootComponent() {
  const { queryClient } = Route.useRouteContext();
  const router = useRouter();
  // Language is a client preference; SSR renders English and the client
  // switches after hydration, which keeps markup deterministic.
  const [lang, setLang] = useState<"en" | "nb">("en");
  useEffect(() => setLang(detectLanguage()), []);
  useEffect(() => void startSentry(router), [router]);
  useEffect(() => hydrateMotionOverride(), []);
  useEffect(() => registerServiceWorker(), []);
  return (
    <RootDocument lang={lang}>
      <QueryClientProvider client={queryClient}>
        <I18nProvider initial={lang} key={lang}>
          <SfxProvider>
            <Layout>
              <Outlet />
            </Layout>
            <Toaster
              position="bottom-center"
              toastOptions={{ className: "!rounded-2xl !font-sans !shadow-pop" }}
            />
          </SfxProvider>
        </I18nProvider>
      </QueryClientProvider>
    </RootDocument>
  );
}

function RootDocument({ children, lang }: Readonly<{ children: ReactNode; lang: "en" | "nb" }>) {
  // `lang` follows the UI language so a screen reader picks the right voice
  // (WCAG 3.1.1). isiXhosa inside the page is marked `lang="xh"` where it is
  // rendered, not here.
  return (
    <html lang={lang}>
      <head>
        <HeadContent />
      </head>
      <body>
        {children}
        <Scripts />
      </body>
    </html>
  );
}
