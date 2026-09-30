import { describe, expect, it } from "vitest";

import { isLocalDbUrl, isLocalUrl } from "./dev.ts";

describe("dev user host guards", () => {
  it("accepts a developer machine", () => {
    expect(isLocalUrl("http://localhost:8787")).toBe(true);
    expect(isLocalUrl("http://127.0.0.1:8787")).toBe(true);
    expect(isLocalDbUrl("postgres://molo:molo@localhost:55432/molo")).toBe(true);
  });

  it("refuses anything that could be a real deployment", () => {
    expect(isLocalUrl("https://api.hellomolo.com")).toBe(false);
    expect(isLocalUrl("http://localhost.evil.example")).toBe(false);
    expect(isLocalDbUrl("postgres://user:pw@aws.connect.psdb.cloud/molo")).toBe(false);
    expect(isLocalDbUrl("not a url")).toBe(false);
    expect(isLocalUrl("")).toBe(false);
  });
});
