import { ACCOUNT_DELETE_CONFIRMATION, confirmWordMatches } from "@molo/core";
import { resources } from "@molo/i18n";
import { afterEach, describe, expect, it, vi } from "vitest";

import { deleteMyAccount } from "./api.ts";

afterEach(() => vi.unstubAllGlobals());

describe("web account deletion", () => {
  it("sends the confirmation token, never the email", async () => {
    const fetch = vi.fn(async () => new Response(JSON.stringify({ ok: true }), { status: 200 }));
    vi.stubGlobal("fetch", fetch);
    await deleteMyAccount();
    const [url, init] = fetch.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toMatch(/\/me$/);
    expect(init.method).toBe("DELETE");
    expect(JSON.parse(String(init.body))).toEqual({ confirm: ACCOUNT_DELETE_CONFIRMATION });
  });

  it("each language's confirmation word is typeable and matches itself", () => {
    for (const lang of ["en", "nb"] as const) {
      const word = resources[lang].translation.account.confirmWord;
      expect(word).toMatch(/^[A-ZÆØÅ]+$/);
      expect(confirmWordMatches(word.toLowerCase(), word)).toBe(true);
    }
  });
});
