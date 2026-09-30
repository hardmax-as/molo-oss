import type { Db } from "@molo/db";
import { expect, it, vi } from "vitest";

import { joinLeague } from "./leagues.ts";

it("does not inspect cohorts or assign opted-out learners", async () => {
  const lock = vi.fn().mockResolvedValue([{ optedOut: true }]);
  const insert = vi.fn();
  const tx = { select: () => ({ from: () => ({ where: () => ({ for: lock }) }) }), insert };
  const db = { transaction: (work: (db: unknown) => unknown) => work(tx) } as unknown as Db;
  expect(await joinLeague(db, "fixture-opted-out")).toBeNull();
  expect(lock).toHaveBeenCalledWith("update");
  expect(insert).not.toHaveBeenCalled();
});
