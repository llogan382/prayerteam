import { Problem, problem, problemContentType } from "@prayerteam/domain";
import { describe, expect, it, vi } from "vitest";
import { createApiClient, retryUnlessClientError } from "../src/index.ts";

// The client through its interface, with the fetch it is given faked.
function clientAnswering(answer: () => Response | Promise<Response>) {
  const onUpgradeRequired = vi.fn();
  const requests: Request[] = [];
  const api = createApiClient({
    baseUrl: "http://api.test",
    fetch: async (input) => {
      requests.push(input as Request);
      return answer();
    },
    app: { version: "1.2.3", platform: "ios" },
    onUpgradeRequired,
  });
  return { api, onUpgradeRequired, requests };
}

const problemJson = (body: Problem) =>
  new Response(JSON.stringify(body), { status: body.status, headers: { "content-type": problemContentType } });

describe("API client", () => {
  it("sends the app's version and platform on every request", async () => {
    const { api, requests } = clientAnswering(() => Response.json({ name: "Prayer Team" }));
    await api.client.GET("/api/meta");
    expect(requests[0]!.headers.get("x-app-version")).toBe("1.2.3");
    expect(requests[0]!.headers.get("x-app-platform")).toBe("ios");
  });

  it("passes the API's own problem through unchanged", async () => {
    const sent = problem("invalid_app_version", { detail: "Bad header." });
    const { api } = clientAnswering(() => problemJson(sent));
    expect((await api.client.GET("/api/meta")).error).toEqual(sent);
  });

  it("tells the app on upgrade_required, and only then", async () => {
    const upgrade = clientAnswering(() => problemJson(problem("upgrade_required")));
    await upgrade.api.client.GET("/api/meta");
    expect(upgrade.onUpgradeRequired).toHaveBeenCalledOnce();

    const other = clientAnswering(() => problemJson(problem("unauthenticated")));
    await other.api.client.GET("/api/meta");
    expect(other.onUpgradeRequired).not.toHaveBeenCalled();
  });

  it.each([
    [404, "not_found", 404],
    [500, "internal_error", 500],
    [504, "internal_error", 504],
    [403, "internal_error", 502],
    [418, "internal_error", 502],
  ])("turns a %i that isn't a problem into %s %i", async (status, code, problemStatus) => {
    const { api } = clientAnswering(() => new Response("<html>proxy</html>", { status, headers: { "content-type": "text/html" } }));
    const { error } = await api.client.GET("/api/meta");
    expect(Problem.strict().parse(error)).toMatchObject({ code, status: problemStatus });
  });

  it("turns no response at all into a 503 internal_error", async () => {
    const { api } = clientAnswering(() => Promise.reject(new TypeError("Network request failed")));
    const { error } = await api.client.GET("/api/meta");
    expect(Problem.strict().parse(error)).toMatchObject({ code: "internal_error", status: 503 });
  });
});

describe("retryUnlessClientError", () => {
  it("never retries a 4xx problem", () => {
    expect(retryUnlessClientError(0, problem("unauthenticated"))).toBe(false);
  });

  it.each([
    ["a 5xx problem", problem("internal_error", { status: 503 })],
    ["anything else", new Error("boom")],
  ])("retries %s twice", (_, error) => {
    expect([0, 1, 2].map((failures) => retryUnlessClientError(failures, error))).toEqual([true, true, false]);
  });
});
