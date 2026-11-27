import { Problem, type ProblemCode, problem, problemContentType } from "@prayerteam/domain";
import type { LightMyRequestResponse } from "fastify";
import { expect } from "vitest";

// The one assertion that a response is the problem for `code`: problem+json
// that matches the shared contract exactly, with the code's default status
// unless another is named. Returns it for further checks.
export function expectProblem(response: LightMyRequestResponse, code: ProblemCode, status?: number): Problem {
  const expected = status ?? problem(code).status;
  expect(response.statusCode).toBe(expected);
  expect(response.headers["content-type"]).toMatch(new RegExp(`^${problemContentType.replace("+", "\\+")}`));
  const body = Problem.strict().parse(response.json());
  expect(body).toMatchObject({ status: expected, code });
  return body;
}
