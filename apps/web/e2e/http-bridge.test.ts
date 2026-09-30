import { once } from "node:events";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";

import { expect, test } from "vitest";

import { serveWorkerRequest } from "./http-bridge.mjs";

test("the transport preserves multipart bytes, cookies and absent Fetch Metadata headers", async () => {
  const body = Buffer.from([0, 255, 13, 10, 128]);
  let received: { headers: Record<string, unknown>; body: Buffer; url?: string } | undefined;
  const upstream = createServer(async (request, response) => {
    const chunks: Buffer[] = [];
    for await (const chunk of request) chunks.push(chunk);
    received = { headers: request.headers, body: Buffer.concat(chunks), url: request.url };
    response.writeHead(403, {
      "content-type": "application/octet-stream",
      "set-cookie": ["session=one; HttpOnly; Path=/", "state=two; Path=/"],
    });
    response.end(body);
  }).listen(0, "127.0.0.1");
  await once(upstream, "listening");
  const target = {
    origin: `http://127.0.0.1:${(upstream.address() as AddressInfo).port}`,
    headers: {},
  };
  const server = createServer((request, response) =>
    serveWorkerRequest(target, "http://localhost:8788", request, response),
  ).listen(0, "127.0.0.1");
  await once(server, "listening");
  try {
    // node:http sends no Sec-Fetch-Mode; fetch() would silently add one.
    const { request } = await import("node:http");
    const result = await new Promise<{
      status?: number;
      headers: Record<string, unknown>;
      body: Buffer;
    }>((resolve, reject) => {
      const client = request(
        `http://127.0.0.1:${(server.address() as AddressInfo).port}/edit/audio?unit=fixture`,
        {
          method: "POST",
          headers: {
            "content-type": "multipart/form-data; boundary=fixture",
            cookie: "session=input",
          },
        },
        async (response) => {
          const chunks: Buffer[] = [];
          for await (const chunk of response) chunks.push(chunk);
          resolve({
            status: response.statusCode,
            headers: response.headers,
            body: Buffer.concat(chunks),
          });
        },
      );
      client.on("error", reject);
      client.end(body);
    });
    expect(received?.url).toBe("/edit/audio?unit=fixture");
    expect(received?.body).toEqual(body);
    expect(received?.headers).toMatchObject({
      cookie: "session=input",
      "content-type": "multipart/form-data; boundary=fixture",
      connection: "close",
      "mf-original-url": "http://localhost:8788/edit/audio?unit=fixture",
    });
    expect(received?.headers).not.toHaveProperty("sec-fetch-mode");
    expect(result.status).toBe(403);
    expect(result.headers["set-cookie"]).toEqual([
      "session=one; HttpOnly; Path=/",
      "state=two; Path=/",
    ]);
    expect(result.body).toEqual(body);
  } finally {
    for (const listener of [server, upstream]) {
      listener.closeAllConnections();
      await new Promise<void>((resolve, reject) =>
        listener.close((error) => (error ? reject(error) : resolve())),
      );
    }
  }
});
