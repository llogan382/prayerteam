import { z } from "zod";
import { Page } from "./pagination.ts";

// PLACEHOLDER (#31): items for the placeholder list endpoint that proves
// cursor pagination. Later specs remove it; it is not a domain concept.
export const PlaceholderItem = z.object({
  id: z.string(),
  label: z.string(),
});
export type PlaceholderItem = z.infer<typeof PlaceholderItem>;

export const PlaceholderItemPage = Page(PlaceholderItem);
