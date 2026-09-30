import { createServer } from "node:http";
import { fileURLToPath } from "node:url";

import { unstable_DevEnv } from "wrangler";

import { serveWorkerRequest } from "./http-bridge.mjs";

// One local Wrangler process, the real API and its e2e bindings. The Node HTTP
// transport goes straight to UserWorker, bypassing ProxyWorker's keep-alive race.
// Unlike fetch-based adapters, it does not invent Sec-Fetch-Mode on API requests.
const port = Number(process.env.E2E_API_PORT ?? "8788");
const origin = `http://localhost:${port}`;
const dev = new unstable_DevEnv();
const ready = new Promise((resolve, reject) => {
  dev.once("reloadComplete", ({ proxyData }) => resolve(proxyData));
  dev.once("error", () => reject(new Error("e2e workerd failed to start")));
});
const worker = await dev.startWorker({
  config: fileURLToPath(new URL("../../api/wrangler.jsonc", import.meta.url)),
  env: "e2e",
  bindings: {
    WEB_ORIGIN: {
      type: "plain_text",
      value: `http://localhost:${process.env.E2E_WEB_PORT ?? "3301"}`,
    },
    BETTER_AUTH_URL: { type: "plain_text", value: origin },
    PUBLIC_AUDIO_BASE_URL: { type: "plain_text", value: `${origin}/audio` },
  },
  dev: {
    server: { hostname: "127.0.0.1", port: 0 },
    remote: false,
    inspector: false,
    watch: false,
    persist: false,
    logLevel: "warn",
  },
});
const proxyData = await ready;
const target = {
  origin: `${proxyData.userWorkerUrl.protocol}//${proxyData.userWorkerUrl.hostname}:${proxyData.userWorkerUrl.port}`,
  headers: proxyData.headers,
};
const server = createServer({ keepAliveTimeout: 60_000 }, (request, response) => {
  serveWorkerRequest(target, origin, request, response);
});
server.listen(port, "localhost");

let stopping = false;
async function stop() {
  if (stopping) return;
  stopping = true;
  server.closeAllConnections();
  server.close();
  await worker.dispose();
}
// Runtime failure remains a failure: no restart/retry, and no error/config dump.
// The browser assertions still run against the failed request.
dev.on("error", ({ source, reason }) => {
  console.error("e2e workerd error:", source, reason);
  process.exitCode = 1;
  void stop();
});
process.once("SIGTERM", () => void stop());
process.once("SIGINT", () => void stop());
