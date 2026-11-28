import { z } from "zod";

export const productName = "Prayer Team";
export const productTagline = "Pray for one another";

export const ProductInfo = z.object({
  name: z.string().min(1),
  tagline: z.string().min(1),
});
export type ProductInfo = z.infer<typeof ProductInfo>;

export const productInfo: ProductInfo = ProductInfo.parse({ name: productName, tagline: productTagline });
