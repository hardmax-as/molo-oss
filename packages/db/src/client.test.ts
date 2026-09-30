import { describe, expect, it } from "vitest";

import { forPostgresJs } from "./client.ts";

/**
 * PlanetScale hands out `?sslmode=verify-full&sslrootcert=system`. The first
 * parameter postgres.js understands; the second it forwards to the server,
 * which rejects it and the connection with it. The first production
 * migration failed on exactly that, so the stripping is asserted.
 */
describe("forPostgresJs", () => {
  it("drops the libpq-only ssl parameters and keeps sslmode", () => {
    const url =
      "postgresql://u.x:pw@aws-eu-west-2-1.pg.psdb.cloud:5432/postgres?sslmode=verify-full&sslrootcert=system";
    const out = new URL(forPostgresJs(url));
    expect(out.searchParams.get("sslmode")).toBe("verify-full");
    expect(out.searchParams.has("sslrootcert")).toBe(false);
    expect(out.username).toBe("u.x");
    expect(out.password).toBe("pw");
    expect(out.host).toBe("aws-eu-west-2-1.pg.psdb.cloud:5432");
  });

  it("returns a URL without those parameters unchanged", () => {
    const local = "postgres://molo:molo@localhost:55432/molo";
    expect(forPostgresJs(local)).toBe(local);
    const hyperdrive = "postgresql://a:b@c.hyperdrive.local:5432/d?sslmode=require";
    expect(forPostgresJs(hyperdrive)).toBe(hyperdrive);
  });
});
