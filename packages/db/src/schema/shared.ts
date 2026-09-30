import { text, timestamp, uuid } from "drizzle-orm/pg-core";

import { users } from "./auth.ts";
import { statusEnum } from "./enums.ts";

/** Primary key used by every content table. */
export const id = () => uuid("id").primaryKey().defaultRandom();

export const timestamps = () => ({
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

/**
 * The status spine (ARCHITECTURE section 2.1). `status` is only ever
 * changed by the repository function that wraps `transition()`.
 */
export const statusColumns = () => ({
  status: statusEnum("status").notNull().default("draft"),
  createdBy: text("created_by").references(() => users.id),
  approvedBy: text("approved_by").references(() => users.id),
  approvedAt: timestamp("approved_at", { withTimezone: true }),
});

export const provenanceColumns = () => ({
  source: text("source").notNull(),
  sourceRef: text("source_ref"),
  licence: text("licence").notNull(),
});
