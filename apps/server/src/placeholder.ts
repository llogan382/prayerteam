import { ListQuery, PlaceholderItemPage, type PlaceholderItem } from "@prayerteam/domain";
import type { FastifyPluginAsync } from "fastify";
import type { ZodTypeProvider } from "fastify-type-provider-zod";
import { z } from "zod";
import { cursorCodec } from "./cursor.ts";

// PLACEHOLDER (#31): a fixed in-memory list that proves cursor pagination.
// Later specs remove this route; real lists page over the database the same
// way, through the same codec.
const items: PlaceholderItem[] = Array.from({ length: 25 }, (_, i) => {
  const n = i + 1;
  return { id: `item-${String(n).padStart(3, "0")}`, label: `Placeholder item ${n}` };
});

// Keyset: the last id on the previous page. Items are sorted by id.
const cursor = cursorCodec(z.object({ afterId: z.string() }));

export const placeholderRoutes: FastifyPluginAsync = async (api) => {
  api.withTypeProvider<ZodTypeProvider>().get(
    "/placeholder-items",
    { schema: { querystring: ListQuery, response: { 200: PlaceholderItemPage } } },
    async (request) => {
      const { limit } = request.query;
      const afterId =
        request.query.cursor === undefined ? undefined : cursor.decode(request.query.cursor).afterId;
      const afterCursor = afterId === undefined ? items : items.filter((item) => item.id > afterId);
      const page = afterCursor.slice(0, limit);
      const last = page.at(-1);
      return {
        items: page,
        nextCursor: afterCursor.length > limit && last ? cursor.encode({ afterId: last.id }) : null,
      };
    },
  );
};
