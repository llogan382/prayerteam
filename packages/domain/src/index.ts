// Shared Zod schemas and types for the app and the API, consumed as TypeScript source.
// Erasable-only syntax and explicit `.ts` import extensions, so Node can strip types (research doc §4.3).
export { ProductInfo, productInfo, productName, productTagline } from "./product.ts";
export { HealthResponse, MetaResponse } from "./meta.ts";
export { FieldError, Problem, ProblemCode, problemCodes, problemContentType } from "./problem.ts";
