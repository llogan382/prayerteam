import { describe, expect, it } from "vitest";
import { testApp } from "./app.ts";
import { expectProblem } from "./problem.ts";

const minimums = { ios: "2.0.0", android: "3.1.0" };

async function call(url: string, headers: Record<string, string>, minimumVersions = minimums) {
  const app = await testApp({ minimumVersions: () => minimumVersions });
  return app.inject({ method: "GET", url, headers });
}

const appHeaders = (version: string, platform: string) => ({
  "x-app-version": version,
  "x-app-platform": platform,
});

describe("app version check", () => {
  it("never applies to /api/health, even far below the minimum", async () => {
    expect((await call("/api/health", appHeaders("0.0.1", "ios"))).statusCode).toBe(200);
  });

  it("allows a request with no version headers", async () => {
    expect((await call("/api/meta", {})).statusCode).toBe(200);
  });

  it.each([
    ["a malformed version", appHeaders("banana", "ios")],
    ["a version with too few parts", appHeaders("2.0", "ios")],
    ["an unknown platform", appHeaders("9.0.0", "windows")],
    ["a version with no platform", { "x-app-version": "9.0.0" }],
  ])("rejects %s with 400 invalid_app_version", async (_, headers) => {
    expectProblem(await call("/api/meta", headers), "invalid_app_version");
  });

  it.each([
    ["ios", "1.9.9", 426],
    ["ios", "2.0.0", 200],
    ["ios", "2.0.1", 200],
    ["ios", "10.0.0", 200],
    ["android", "3.0.9", 426],
    ["android", "3.1.0", 200],
    ["android", "3.10.0", 200],
  ])("%s %s against its own minimum gives %i", async (platform, version, status) => {
    const response = await call("/api/meta", appHeaders(version, platform));
    if (status === 426) expectProblem(response, "upgrade_required");
    else expect(response.statusCode).toBe(200);
  });

  it("raising one platform's minimum doesn't affect the other", async () => {
    const raised = { ios: "50.0.0", android: "1.0.0" };
    expectProblem(await call("/api/meta", appHeaders("2.0.0", "ios"), raised), "upgrade_required");
    expect((await call("/api/meta", appHeaders("2.0.0", "android"), raised)).statusCode).toBe(200);
  });

  it("never blocks web, whatever its version", async () => {
    const high = { ios: "99.0.0", android: "99.0.0" };
    for (const version of ["0.0.1", "1.0.0", "99.0.0"]) {
      expect((await call("/api/meta", appHeaders(version, "web"), high)).statusCode).toBe(200);
    }
  });

  it("uses the provider's current minimums, so they can change without a restart", async () => {
    let current = { ios: "1.0.0", android: "1.0.0" };
    const app = await testApp({ minimumVersions: () => current });
    const request = () => app.inject({ method: "GET", url: "/api/meta", headers: appHeaders("2.0.0", "ios") });
    expect((await request()).statusCode).toBe(200);
    current = { ios: "3.0.0", android: "1.0.0" };
    expect((await request()).statusCode).toBe(426);
  });
});

describe("GET /api/meta", () => {
  it("returns the current minimum versions", async () => {
    const response = await call("/api/meta", {});
    expect(response.json()).toEqual({ name: "Prayer Team", minimumVersions: minimums });
  });
});
