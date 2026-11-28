import { z } from "zod";

// Every API error is an RFC 9457 problem with a stable machine `code`. The
// app branches on `code`, never on `title` or `detail` (ADR 0002). Later
// specs add codes; existing ones never change meaning.
//
// The catalogue: each code with the statuses it is sent with. The first is
// the default; another must be named, and must be listed here.
// - validation_failed: the request is invalid. Either fields fail their
//   schema (400, one `errors` entry each) or the request itself is malformed,
//   such as unparseable JSON, a body that is too large, a parameter that is
//   too long or an unsupported content type (400, 413, 414 or 415, with
//   `detail`).
// - internal_error: the catch-all. 500 from the API; the client also makes
//   one when something other than the API answered (502, or the 5xx it got)
//   or nothing answered at all (503).
const problemStatuses = {
  validation_failed: [400, 413, 414, 415],
  invalid_cursor: [400],
  invalid_app_version: [400],
  upgrade_required: [426],
  not_found: [404],
  internal_error: [500, 502, 503, 504],
  unauthenticated: [401],
} as const;

export type ProblemCode = keyof typeof problemStatuses;
export const problemCodes = Object.keys(problemStatuses) as [ProblemCode, ...ProblemCode[]];
export const ProblemCode = z.enum(problemCodes);

// The statuses `code` may be sent with.
export type ProblemStatus<Code extends ProblemCode> = (typeof problemStatuses)[Code][number];

export function isProblemStatus<Code extends ProblemCode>(code: Code, status: number): status is ProblemStatus<Code> {
  return (problemStatuses[code] as readonly number[]).includes(status);
}

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

// The HTTP status phrase for every status in the catalogue, so the server
// and the client title a problem the same way.
const statusTitles: Record<ProblemStatus<ProblemCode>, string> = {
  400: "Bad Request",
  401: "Unauthorized",
  404: "Not Found",
  413: "Payload Too Large",
  414: "URI Too Long",
  415: "Unsupported Media Type",
  426: "Upgrade Required",
  500: "Internal Server Error",
  502: "Bad Gateway",
  503: "Service Unavailable",
  504: "Gateway Timeout",
};

export interface ProblemOptions<Code extends ProblemCode> {
  // Defaults to the code's first status.
  status?: ProblemStatus<Code>;
  // Must be safe for the client to read.
  detail?: string;
  errors?: FieldError[];
}

// The one way to make a Problem. `type` is about:blank, so `title` is the
// status phrase and `code` carries the meaning (RFC 9457 §4.2.1).
export function problem<Code extends ProblemCode>(code: Code, options: ProblemOptions<Code> = {}): Problem {
  const status: ProblemStatus<ProblemCode> = options.status ?? problemStatuses[code][0];
  return {
    type: "about:blank",
    title: statusTitles[status],
    status,
    code,
    ...(options.detail === undefined ? {} : { detail: options.detail }),
    ...(options.errors === undefined ? {} : { errors: options.errors }),
  };
}
