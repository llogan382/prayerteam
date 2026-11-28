import type { ListQuery } from "@prayerteam/domain";
import type { z } from "zod";
import { ProblemError } from "./problems.ts";

// Fetches up to `limit` items after `after` (from the start when undefined),
// in the list's keyset order. For a real list this is a viewer-scoped query
// in packages/db (ADR 0004).
export type FetchAfter<Position, Item> = (after: Position | undefined, limit: number) => Promise<Item[]> | Item[];

interface ListPage<Item> {
  items: Item[];
  nextCursor: string | null;
}

// Keyset pagination for one list, the way every list endpoint pages:
// - `position` is the Zod schema of the keyset position a cursor carries
// - `keyOf` gives an item's position; the next page starts after the last
//   item's
//
// `page` decodes the query's cursor, asks `fetchAfter` for one item more
// than the limit to learn whether another page exists, and encodes the next
// cursor. Cursors are base64url JSON, checked against `position` on the way
// back in: any cursor that doesn't decode to a valid position (one we didn't
// issue, or one that was altered) is a 400 invalid_cursor.
export function keysetPagination<Position extends z.ZodType, Item>(options: {
  position: Position;
  keyOf: (item: Item) => z.infer<Position>;
}) {
  const { position, keyOf } = options;

  function decode(cursor: string): z.infer<Position> {
    let json: unknown;
    try {
      json = JSON.parse(Buffer.from(cursor, "base64url").toString("utf8"));
    } catch {
      throw invalidCursor();
    }
    const parsed = position.safeParse(json);
    if (!parsed.success) throw invalidCursor();
    return parsed.data;
  }

  return {
    async page(query: ListQuery, fetchAfter: FetchAfter<z.infer<Position>, Item>): Promise<ListPage<Item>> {
      const after = query.cursor === undefined ? undefined : decode(query.cursor);
      const fetched = await fetchAfter(after, query.limit + 1);
      const items = fetched.slice(0, query.limit);
      const last = items.at(-1);
      const more = fetched.length > query.limit && last !== undefined;
      return {
        items,
        nextCursor: more ? Buffer.from(JSON.stringify(keyOf(last))).toString("base64url") : null,
      };
    },
  };
}

function invalidCursor(): ProblemError {
  return new ProblemError("invalid_cursor", "Pass back a nextCursor exactly as this API returned it.");
}
