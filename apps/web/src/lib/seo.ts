import { resources } from "@molo/i18n";

/**
 * What a crawler and a link preview see. The server renders English (the
 * language is a client preference, see __root.tsx), so the strings here are
 * the English ones from packages/i18n rather than the hook; nothing a
 * learner reads is written in this file.
 */
const en = resources.en.translation.app;

/** The public origin, for canonical and Open Graph URLs. */
export const SITE_URL =
  (import.meta.env["VITE_SITE_URL"] as string | undefined) ?? "https://hellomolo.com";

export const SITE_TITLE = `${en.name} · ${en.tagline}`;

/** The one meta tag that keeps a private surface out of search results. */
export const NOINDEX = { name: "robots", content: "noindex, nofollow" } as const;

/** A canonical URL: the public origin, the path, no query and no trailing slash. */
export function canonicalUrl(pathname: string): string {
  const path = pathname.replace(/\/+$/, "") || "/";
  return path === "/" ? `${SITE_URL}/` : `${SITE_URL}${path}`;
}

/** The site-wide head: description, Open Graph, Twitter card and structured data. */
export function siteMeta(): Array<Record<string, unknown>> {
  return [
    { title: SITE_TITLE },
    { name: "description", content: en.description },
    { name: "application-name", content: en.name },
    { property: "og:type", content: "website" },
    { property: "og:site_name", content: en.name },
    { property: "og:title", content: SITE_TITLE },
    { property: "og:description", content: en.description },
    { property: "og:image", content: `${SITE_URL}/og.png` },
    { property: "og:image:width", content: "1200" },
    { property: "og:image:height", content: "630" },
    { property: "og:image:alt", content: SITE_TITLE },
    { property: "og:locale", content: "en_GB" },
    { property: "og:locale:alternate", content: "nb_NO" },
    { name: "twitter:card", content: "summary_large_image" },
    { name: "twitter:title", content: SITE_TITLE },
    { name: "twitter:description", content: en.description },
    { name: "twitter:image", content: `${SITE_URL}/og.png` },
    {
      "script:ld+json": {
        "@context": "https://schema.org",
        "@graph": [
          {
            "@type": "Organization",
            "@id": `${SITE_URL}/#organization`,
            name: en.name,
            url: `${SITE_URL}/`,
            logo: `${SITE_URL}/icon-512.png`,
          },
          {
            "@type": "WebSite",
            "@id": `${SITE_URL}/#website`,
            name: en.name,
            description: en.description,
            url: `${SITE_URL}/`,
            inLanguage: ["en", "nb"],
            publisher: { "@id": `${SITE_URL}/#organization` },
          },
          {
            "@type": "SoftwareApplication",
            name: en.name,
            description: en.description,
            url: `${SITE_URL}/`,
            applicationCategory: "EducationalApplication",
            operatingSystem: "Web, iOS, Android",
            inLanguage: ["en", "nb"],
            offers: { "@type": "Offer", price: "0", priceCurrency: "USD" },
          },
        ],
      },
    },
  ];
}
