import {
  AppPlatform,
  AppVersion,
  appPlatformHeader,
  appVersionHeader,
  compareAppVersions,
  type MinimumVersions,
} from "@prayerteam/domain";
import type { FastifyRequest } from "fastify";
import { ProblemError } from "./problems.ts";

// Routes the check never applies to: the liveness probe must answer
// whatever is calling it. openapi.ts leaves the headers off these too.
export const unversionedRoutes: readonly string[] = ["/api/health"];

// Returns the current minimums. Production will read them from SSM and
// refresh them every few minutes (#34); locally and in tests it returns
// fixed values.
export type MinimumVersionsProvider = () => MinimumVersions | Promise<MinimumVersions>;

// No platform has a minimum: for tests and the OpenAPI generator.
export const noMinimumVersions: MinimumVersionsProvider = () => ({ ios: "0.0.0", android: "0.0.0" });

// The onRequest check for every /api route except the health check:
// - no version header: allowed (older clients, curl, the health probe)
// - a malformed version, or a missing or unknown platform: 400 invalid_app_version
// - a native platform below its minimum: 426 upgrade_required
// - web: never blocked
export function appVersionCheck(minimumVersions: MinimumVersionsProvider) {
  return async (request: FastifyRequest) => {
    if (unversionedRoutes.includes(request.routeOptions.url ?? "")) return;
    const version = request.headers[appVersionHeader];
    if (version === undefined) return;

    const parsedVersion = AppVersion.safeParse(version);
    const platform = AppPlatform.safeParse(request.headers[appPlatformHeader]);
    if (!parsedVersion.success || !platform.success) {
      throw new ProblemError(
        "invalid_app_version",
        `Send ${appVersionHeader} as MAJOR.MINOR.PATCH with ${appPlatformHeader} as ios, android or web.`,
      );
    }
    if (platform.data === "web") return;

    const minimum = (await minimumVersions())[platform.data];
    if (compareAppVersions(parsedVersion.data, minimum) < 0) {
      throw new ProblemError("upgrade_required", `This app needs version ${minimum} or newer.`);
    }
  };
}
