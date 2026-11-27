import { PlaceholderItemPage, Problem } from "@prayerteam/domain";
import { describe, expect, it } from "vitest";
import type { App } from "../src/app.ts";
import { testApp } from "./app.ts";

type ItemPage = ReturnType<typeof PlaceholderItemPage.parse>;

async function getPage(app: App, query: Record<string, string>) {
  return app.inject({ method: "GET", url: `/api/placeholder-items?${new URLSearchParams(query)}` });
}

// Follows nextCursor from the first page to the last.
async function walk(app: App, limit: number): Promise<ItemPage[]> {
  const pages: ItemPage[] = [];
  let cursor: string | null = null;
  do {
    const response = await getPage(app, { limit: String(limit), ...(cursor === null ? {} : { cursor }) });
    expect(response.statusCode).toBe(200);
    const page = PlaceholderItemPage.parse(response.json());
    pages.push(page);
    cursor = page.nextCursor;
  } while (cursor !== null && pages.length < 100);
  return pages;
}

async function expectInvalidCursor(app: App, cursor: string) {
  const response = await getPage(app, { cursor });
  expect(response.statusCode).toBe(400);
  expect(response.headers["content-type"]).toMatch(/^application\/problem\+json/);
  expect(Problem.parse(response.json())).toMatchObject({ status: 400, code: "invalid_cursor" });
}

describe("GET /api/placeholder-items", () => {
  it("returns every item exactly once, in order, across pages", async () => {
    const pages = await walk(await testApp(), 10);
    const ids = pages.flatMap((page) => page.items.map((item) => item.id));
    expect(ids).toEqual(Array.from({ length: 25 }, (_, i) => `item-${String(i + 1).padStart(3, "0")}`));
    expect(pages.map((page) => page.items.length)).toEqual([10, 10, 5]);
  });

  it("ends with nextCursor null on the last page, including an exact fit", async () => {
    const app = await testApp();
    for (const limit of [5, 25, 100]) {
      const pages = await walk(app, limit);
      expect(pages.at(-1)!.nextCursor, `limit ${limit}`).toBeNull();
      expect(pages.slice(0, -1).every((page) => page.nextCursor !== null)).toBe(true);
      expect(pages.flatMap((page) => page.items)).toHaveLength(25);
    }
  });

  it("uses the default limit of 20 when none is given", async () => {
    const response = await getPage(await testApp(), {});
    expect(PlaceholderItemPage.parse(response.json()).items).toHaveLength(20);
  });

  it("rejects a limit above the maximum with validation_failed", async () => {
    const response = await getPage(await testApp(), { limit: "101" });
    expect(response.statusCode).toBe(400);
    const problem = Problem.parse(response.json());
    expect(problem).toMatchObject({ code: "validation_failed" });
    expect(problem.errors?.map((error) => error.path)).toEqual(["limit"]);
  });

  it.each([
    ["garbage", "!!!not-a-cursor!!!"],
    ["empty", ""],
  ])("rejects a %s cursor with invalid_cursor", async (_, cursor) => {
    await expectInvalidCursor(await testApp(), cursor);
  });

  it("rejects a real cursor that was altered with invalid_cursor", async () => {
    const app = await testApp();
    const first = PlaceholderItemPage.parse((await getPage(app, { limit: "5" })).json());
    await expectInvalidCursor(app, first.nextCursor!.slice(0, -4));
  });
});
