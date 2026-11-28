import { ListQuery, PlaceholderItemPage, type PlaceholderItem } from "@prayerteam/domain";
import type { FastifyPluginAsync } from "fastify";
import type { ZodTypeProvider } from "fastify-type-provider-zod";
import { z } from "zod";
import { keysetPagination } from "./pagination.ts";

// PLACEHOLDER (#31): a fixed in-memory list that proves cursor pagination.
// Later specs remove this route; real lists page over the database the same
// way, through the same pagination module.
const items: PlaceholderItem[] = Array.from({ length: 25 }, (_, i) => {
  const n = i + 1;
  return { id: `item-${String(n).padStart(3, "0")}`, label: `Placeholder item ${n}` };
});

// Keyset: the last id on the previous page. Items are sorted by id.
const pagination = keysetPagination({
  position: z.object({ afterId: z.string() }),
  keyOf: (item: PlaceholderItem) => ({ afterId: item.id }),
});

export const placeholderRoutes: FastifyPluginAsync = async (api) => {
  api.withTypeProvider<ZodTypeProvider>().get(
    "/placeholder-items",
    { config: { public: true }, schema: { querystring: ListQuery, response: { 200: PlaceholderItemPage } } },
    (request) =>
      pagination.page(request.query, (after, limit) =>
        items.filter((item) => after === undefined || item.id > after.afterId).slice(0, limit),
      ),
  );
};
