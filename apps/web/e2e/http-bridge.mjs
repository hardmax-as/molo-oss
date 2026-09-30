import { request as httpRequest } from "node:http";

/** Preserve HTTP bytes/headers while avoiding the dev proxy's stale socket pool. */
export function serveWorkerRequest(target, origin, request, response) {
  const upstream = httpRequest(
    new URL(request.url, target.origin),
    {
      method: request.method,
      agent: false,
      headers: {
        ...request.headers,
        ...target.headers,
        "MF-Original-URL": new URL(request.url, origin).href,
        connection: "close",
      },
    },
    (result) => {
      response.writeHead(result.statusCode, result.headers);
      result.pipe(response);
      result.on("error", () => response.destroy());
    },
  );
  upstream.on("error", (error) => {
    // No request headers, bodies or Wrangler config (which contains secrets).
    console.error("e2e API transport failed:", error.code ?? "unknown");
    if (!response.headersSent) response.writeHead(502);
    response.end();
  });
  request.on("aborted", () => upstream.destroy());
  request.pipe(upstream);
}
