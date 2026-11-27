import { z } from "zod";

// Every API error is an RFC 9457 problem with a stable machine `code`. The
// app branches on `code`, never on `title` or `detail` (ADR 0002). Later
// specs add codes; existing ones never change meaning.
// - validation_failed: the request is invalid. Either fields fail their
//   schema (400, one `errors` entry each) or the request itself is malformed,
//   such as unparseable JSON, an unsupported content type or a body that is
//   too large (400, 415 or 413, with `detail`).
export const problemCodes = [
  "validation_failed",
  "invalid_cursor",
  "invalid_app_version",
  "upgrade_required",
  "not_found",
  "internal_error",
  "unauthenticated",
] as const;
export const ProblemCode = z.enum(problemCodes);
export type ProblemCode = z.infer<typeof ProblemCode>;

// One per invalid field: `path` names it, e.g. `limit` or `items.0.name`.
export const FieldError = z.object({
  path: z.string(),
  message: z.string(),
});
export type FieldError = z.infer<typeof FieldError>;

export const Problem = z.object({
  type: z.string(),
  title: z.string(),
  status: z.number().int().min(400).max(599),
  code: ProblemCode,
  detail: z.string().optional(),
  errors: z.array(FieldError).optional(),
});
export type Problem = z.infer<typeof Problem>;

export const problemContentType = "application/problem+json";
