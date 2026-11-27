import { ListQuery } from "@prayerteam/domain";
import { describe, expect, it } from "vitest";
import { z } from "zod";
import { keysetPagination } from "../src/pagination.ts";
import { expectProblemError } from "./problem.ts";

// The pagination module through its interface, over an in-memory list: no
// app, no database. Each list endpoint keeps only a thin route test.
const ids = (count: number) => Array.from({ length: count }, (_, i) => i + 1);

function numberList(count: number) {
  const items = ids(count);
  const fetches: { after: number | undefined; limit: number }[] = [];
  const pagination = keysetPagination({
    position: z.object({ after: z.number().int() }),
    keyOf: (item: number) => ({ after: item }),
  });
  return {
    fetches,
    page: (query: { cursor?: string; limit?: number }) =>
      pagination.page(ListQuery.parse(query), (after, limit) => {
        fetches.push({ after: after?.after, limit });
        return items.filter((item) => after === undefined || item > after.after).slice(0, limit);
      }),
  };
}

// Follows nextCursor from the first page to the last.
async function walk(list: ReturnType<typeof numberList>, limit: number) {
  const pages: { items: number[]; nextCursor: string | null }[] = [];
  let cursor: string | null = null;
  do {
    const page = await list.page({ limit, ...(cursor === null ? {} : { cursor }) });
    pages.push(page);
    cursor = page.nextCursor;
  } while (cursor !== null && pages.length < 100);
  return pages;
}

describe("keyset pagination", () => {
  it("returns every item exactly once, in order, across pages", async () => {
    const pages = await walk(numberList(25), 10);
    expect(pages.flatMap((page) => page.items)).toEqual(ids(25));
    expect(pages.map((page) => page.items.length)).toEqual([10, 10, 5]);
  });

  it.each([5, 25, 100])("ends with nextCursor null on the last page at limit %i, including an exact fit", async (limit) => {
    const pages = await walk(numberList(25), limit);
    expect(pages.at(-1)!.nextCursor).toBeNull();
    expect(pages.slice(0, -1).every((page) => page.nextCursor !== null)).toBe(true);
    expect(pages.flatMap((page) => page.items)).toEqual(ids(25));
  });

  it("answers an empty list with one empty last page", async () => {
    expect(await numberList(0).page({})).toEqual({ items: [], nextCursor: null });
  });

  it("asks for one more than the limit, after the previous page's last key", async () => {
    const list = numberList(25);
    await walk(list, 10);
    expect(list.fetches).toEqual([
      { after: undefined, limit: 11 },
      { after: 10, limit: 11 },
      { after: 20, limit: 11 },
    ]);
  });

  it("uses the default limit of 20 when none is given", async () => {
    expect((await numberList(25).page({})).items).toHaveLength(20);
  });

  it.each([
    ["garbage", "!!!not-a-cursor!!!"],
    ["empty", ""],
    ["another list's", Buffer.from(JSON.stringify({ afterId: "item-001" })).toString("base64url")],
  ])("rejects a %s cursor with invalid_cursor", async (_, cursor) => {
    await expectProblemError(() => numberList(25).page({ cursor }), "invalid_cursor");
  });

  it("rejects a real cursor that was altered with invalid_cursor", async () => {
    const list = numberList(25);
    const { nextCursor } = await list.page({ limit: 5 });
    await expectProblemError(() => list.page({ cursor: nextCursor!.slice(0, -4) }), "invalid_cursor");
  });
});
