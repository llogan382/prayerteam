import { isProblemStatus, type Problem, type ProblemCode, problem, problemContentType } from "@prayerteam/domain";
import type { FastifyInstance, FastifyReply } from "fastify";
import { hasZodFastifySchemaValidationErrors } from "fastify-type-provider-zod";

// Puts a Problem on the reply: the server's adapter for problem+json.
function sendProblem(reply: FastifyReply, body: Problem): FastifyReply {
  return reply.code(body.status).type(problemContentType).send(body);
}

// Thrown anywhere in a request to answer with that problem. The code alone
// picks the status (domain's problem catalogue); `detail` must be safe for
// the client to read.
export class ProblemError extends Error {
  override name = "ProblemError";
  readonly problem: Problem;

  constructor(code: ProblemCode, detail?: string) {
    super(detail ?? code);
    this.problem = problem(code, detail === undefined ? {} : { detail });
  }
}

// Turns every failure on the app into a problem.
export function handleProblems(app: FastifyInstance): void {
  app.setNotFoundHandler((_request, reply) => sendProblem(reply, problem("not_found")));

  app.setErrorHandler((error, request, reply) => {
    // A request that fails its route's Zod schema: one entry per bad field.
    if (hasZodFastifySchemaValidationErrors(error)) {
      return sendProblem(
        reply,
        problem("validation_failed", {
          errors: error.validation.map((issue) => ({
            path: issue.instancePath.split("/").filter(Boolean).join("."),
            message: issue.message ?? "Invalid value",
          })),
        }),
      );
    }
    if (error instanceof ProblemError) return sendProblem(reply, error.problem);
    // Fastify's own client errors (malformed JSON, unsupported content
    // type, body too large) keep their 4xx status. Their messages describe
    // the request, not the server, so they are safe to return. A status the
    // catalogue doesn't list for validation_failed is sent as 400.
    if (isFastifyClientError(error)) {
      const { statusCode: status, message: detail } = error;
      if (status === 404) return sendProblem(reply, problem("not_found", { detail }));
      return sendProblem(
        reply,
        problem("validation_failed", { detail, ...(isProblemStatus("validation_failed", status) ? { status } : {}) }),
      );
    }
    // The full error goes to the log only: its message and stack can name
    // internals the client must never see.
    request.log.error({ err: error }, "unhandled error");
    return sendProblem(reply, problem("internal_error"));
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
