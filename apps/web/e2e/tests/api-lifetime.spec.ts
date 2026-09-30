import { setTimeout as delay } from "node:timers/promises";

import { expect, test } from "@playwright/test";

import { E2E_API } from "../playwright.config.ts";

test("the API survives POSTs across workerd's five-second idle boundary", async ({ request }) => {
  test.setTimeout(60_000);
  const start = performance.now();
  for (let index = 0; index < 8; index++) {
    // Send-time aligned: sleeping five seconds AFTER the response misses the
    // ProxyWorker/UserWorker keep-alive race. No retries or account creation.
    await delay(Math.max(0, start + index * 5_000 - performance.now()));
    const response = await request.post(`${E2E_API}/api/auth/sign-up/email`, {
      data: { email: "lifetime@example.test", password: "fixture-password", name: "Fixture" },
    });
    expect(response.status()).toBe(400);
    expect((await request.get(`${E2E_API}/api/auth/ok`)).ok()).toBe(true);
  }
});
