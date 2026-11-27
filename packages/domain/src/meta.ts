import { z } from "zod";
import { MinimumVersions } from "./app-version.ts";
import { ProductInfo } from "./product.ts";

// GET /api/health: liveness only.
export const HealthResponse = z.object({
  status: z.literal("ok"),
});
export type HealthResponse = z.infer<typeof HealthResponse>;

// GET /api/meta: what the app needs to know about the API it talks to.
export const MetaResponse = ProductInfo.pick({ name: true }).extend({
  minimumVersions: MinimumVersions,
});
export type MetaResponse = z.infer<typeof MetaResponse>;
