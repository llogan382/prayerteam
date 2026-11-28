// Better Auth's tables (ADR 0003). Generated with
// `pnpm --filter @prayerteam/server auth:generate` (which writes the raw
// output to apps/server/.better-auth/schema.ts, not committed), then adapted
// to the conventions in ./index.ts, because the generator emits text ids,
// timestamps without a time zone and Drizzle 0.45 relations:
// - ids are uuid with a uuidv7() default (Better Auth's generateId: false)
// - every timestamp is timestamptz
// - no relations; nothing queries across these tables yet
// When Better Auth's schema changes, regenerate, re-apply these three
// adaptations, then `db:generate` a migration.
import { sql } from "drizzle-orm";
import { boolean, index, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";

const id = () => uuid("id").primaryKey().default(sql`uuidv7()`);
const timestamptz = (name: string) => timestamp(name, { withTimezone: true });
const createdAt = () => timestamptz("created_at").defaultNow().notNull();
const updatedAt = () =>
  timestamptz("updated_at")
    .defaultNow()
    .$onUpdate(() => new Date())
    .notNull();

// Better Auth's "user": an Account (GLOSSARY.md). `name` is the display name.
export const account = pgTable("account", {
  id: id(),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  emailVerified: boolean("email_verified").default(false).notNull(),
  image: text("image"),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

export const session = pgTable(
  "session",
  {
    id: id(),
    expiresAt: timestamptz("expires_at").notNull(),
    token: text("token").notNull().unique(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
    ipAddress: text("ip_address"),
    userAgent: text("user_agent"),
    userId: uuid("user_id")
      .notNull()
      .references(() => account.id, { onDelete: "cascade" }),
  },
  (table) => [index("session_user_id_idx").on(table.userId)],
);

// Better Auth's "account": a way to sign in to an Account. Only the
// password credential exists in v1.
export const credential = pgTable(
  "credential",
  {
    id: id(),
    accountId: text("account_id").notNull(),
    providerId: text("provider_id").notNull(),
    userId: uuid("user_id")
      .notNull()
      .references(() => account.id, { onDelete: "cascade" }),
    accessToken: text("access_token"),
    refreshToken: text("refresh_token"),
    idToken: text("id_token"),
    accessTokenExpiresAt: timestamptz("access_token_expires_at"),
    refreshTokenExpiresAt: timestamptz("refresh_token_expires_at"),
    scope: text("scope"),
    password: text("password"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [index("credential_user_id_idx").on(table.userId)],
);

// Short-lived tokens, such as password reset links.
export const verification = pgTable(
  "verification",
  {
    id: id(),
    identifier: text("identifier").notNull(),
    value: text("value").notNull(),
    expiresAt: timestamptz("expires_at").notNull(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [index("verification_identifier_idx").on(table.identifier)],
);
