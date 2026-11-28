import { PlaceholderItemPage } from "@prayerteam/domain";
import { describe, expect, it } from "vitest";
import type { App } from "../src/app.ts";
import { testApp } from "./app.ts";
import { expectProblem } from "./problem.ts";

// The route over the pagination module: its paging rules are tested in
// pagination.test.ts.
function getPage(app: App, query: Record<string, string>) {
  return app.inject({ method: "GET", url: `/api/placeholder-items?${new URLSearchParams(query)}` });
}

describe("GET /api/placeholder-items", () => {
  it("pages through every item by following nextCursor", async () => {
    const app = await testApp();
    const first = PlaceholderItemPage.parse((await getPage(app, { limit: "20" })).json());
    const second = PlaceholderItemPage.parse((await getPage(app, { limit: "20", cursor: first.nextCursor! })).json());
    expect([...first.items, ...second.items].map((item) => item.id)).toEqual(
      Array.from({ length: 25 }, (_, i) => `item-${String(i + 1).padStart(3, "0")}`),
    );
    expect(second.nextCursor).toBeNull();
  });

  it("rejects a limit above the maximum with validation_failed", async () => {
    const problem = expectProblem(await getPage(await testApp(), { limit: "101" }), "validation_failed");
    expect(problem.errors?.map((error) => error.path)).toEqual(["limit"]);
  });

  it("rejects a cursor it didn't issue with invalid_cursor", async () => {
    expectProblem(await getPage(await testApp(), { cursor: "!!!not-a-cursor!!!" }), "invalid_cursor");
  });
});
