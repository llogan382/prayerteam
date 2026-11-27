import { type Problem, type ProblemCode, problemContentType } from "@prayerteam/domain";
import type { FastifyInstance, FastifyReply } from "fastify";
import { hasZodFastifySchemaValidationErrors } from "fastify-type-provider-zod";
import { STATUS_CODES } from "node:http";

// Sends a problem+json response. `type` is about:blank, so `title` is the
// HTTP status phrase and `code` carries the meaning (RFC 9457 §4.2.1).
function sendProblem(
  reply: FastifyReply,
  status: number,
  code: ProblemCode,
  extra: Pick<Problem, "detail" | "errors"> = {},
): FastifyReply {
  const problem: Problem = {
    type: "about:blank",
    title: STATUS_CODES[status] ?? "Error",
    status,
    code,
    ...extra,
  };
  return reply.code(status).type(problemContentType).send(problem);
}

// Thrown anywhere in a request to answer with that problem. `detail` must
// be safe for the client to read.
export class ProblemError extends Error {
  override name = "ProblemError";
  readonly status: number;
  readonly code: ProblemCode;
  readonly detail: string | undefined;

  constructor(status: number, code: ProblemCode, detail?: string) {
    super(detail ?? code);
    this.status = status;
    this.code = code;
    this.detail = detail;
  }
}

// Turns every failure on the app into a problem.
export function handleProblems(app: FastifyInstance): void {
  app.setNotFoundHandler((_request, reply) => sendProblem(reply, 404, "not_found"));

  app.setErrorHandler((error, request, reply) => {
    // A request that fails its route's Zod schema: one entry per bad field.
    if (hasZodFastifySchemaValidationErrors(error)) {
      return sendProblem(reply, 400, "validation_failed", {
        errors: error.validation.map((issue) => ({
          path: issue.instancePath.split("/").filter(Boolean).join("."),
          message: issue.message ?? "Invalid value",
        })),
      });
    }
    if (error instanceof ProblemError) {
      return sendProblem(reply, error.status, error.code, error.detail ? { detail: error.detail } : {});
    }
    // Fastify's own client errors (malformed JSON, unsupported content
    // type, body too large) keep their 4xx status. Their messages describe
    // the request, not the server, so they are safe to return.
    if (isFastifyClientError(error)) {
      return sendProblem(reply, error.statusCode, "validation_failed", { detail: error.message });
    }
    // The full error goes to the log only: its message and stack can name
    // internals the client must never see.
    request.log.error({ err: error }, "unhandled error");
    return sendProblem(reply, 500, "internal_error");
  });
}

// Only Fastify's own errors (codes FST_*): a handler's error with a 4xx
// status could still carry an internal message.
function isFastifyClientError(error: unknown): error is { statusCode: number; message: string } {
  const { statusCode, code } = error as { statusCode?: unknown; code?: unknown };
  return (
    typeof code === "string" &&
    code.startsWith("FST_") &&
    typeof statusCode === "number" &&
    statusCode >= 400 &&
    statusCode < 500
  );
}
