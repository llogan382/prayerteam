import { z } from "zod";

// Every list endpoint takes `?cursor=&limit=` and answers with one page.
// Cursors are opaque: clients only pass back a `nextCursor` they were given,
// so the server can change the keyset behind them without breaking apps.
const pageLimit = { default: 20, max: 100 } as const;

export const ListQuery = z.object({
  // Any string: one the server didn't issue, empty included, is 400
  // invalid_cursor rather than a schema failure.
  cursor: z.string().optional().describe("Opaque. Pass back a `nextCursor` from the previous page."),
  limit: z.coerce
    .number()
    .int()
    .min(1)
    .max(pageLimit.max)
    .default(pageLimit.default)
    .describe(
      `Page size, 1 to ${pageLimit.max} (default ${pageLimit.default}). A larger value is rejected with validation_failed, not clamped.`,
    ),
});
export type ListQuery = z.infer<typeof ListQuery>;

// One page of `item`: `nextCursor` is null on the last page.
export function Page<Item extends z.ZodType>(item: Item) {
  return z.object({
    items: z.array(item),
    nextCursor: z.string().nullable(),
  });
}
