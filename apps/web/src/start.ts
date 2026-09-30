import { createMiddleware, createStart } from "@tanstack/react-start";

/**
 * One origin for the web app. The API allows exactly WEB_ORIGIN in CORS and
 * Better Auth sets its cookies for that origin, so a learner who typed
 * www.hellomolo.com would sign in and never be signed in. The permanent
 * redirect keeps www. as an address people type and nothing more.
 */
const canonicalHost = createMiddleware({ type: "request" }).server(({ request, next }) => {
  const url = new URL(request.url);
  if (!url.hostname.startsWith("www.")) return next();
  url.hostname = url.hostname.slice("www.".length);
  return Response.redirect(url.toString(), 301);
});

export const startInstance = createStart(() => ({ requestMiddleware: [canonicalHost] }));
