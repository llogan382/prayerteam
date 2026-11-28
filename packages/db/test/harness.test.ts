import { sql } from "drizzle-orm";
import { afterAll, describe, expect, it } from "vitest";
import { createTestDatabase } from "../src/testing.ts";

// Each test file gets its own copy of the migrated template database, so
// files can run in parallel and never see each other's writes (#14).
const database = await createTestDatabase();
afterAll(() => database.close());

describe("test databases", () => {
  it("are a separate copy of the migrated template", async () => {
    const result = await database.db.execute<{ name: string }>(sql`select current_database() as name`);
    expect(result.rows[0]!.name).toMatch(/^prayerteam_test_/);
    expect(result.rows[0]!.name).not.toMatch(/^prayerteam_test_template/);
    // The migrator's own bookkeeping table: present only in a migrated copy.
    const migrations = await database.db.execute<{ name: string | null }>(
      sql`select to_regclass('drizzle.__drizzle_migrations')::text as name`,
    );
    expect(migrations.rows[0]!.name).not.toBeNull();
  });

  it("start without another copy's writes", async () => {
    await database.db.execute(sql`create table scratch (id int)`);
    const fresh = await createTestDatabase();
    try {
      const tables = await fresh.db.execute<{ name: string | null }>(sql`select to_regclass('scratch')::text as name`);
      expect(tables.rows[0]!.name).toBeNull();
    } finally {
      await fresh.close();
    }
  });
});
