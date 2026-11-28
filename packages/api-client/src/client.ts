import {
  type AppPlatform,
  appPlatformHeader,
  appVersionHeader,
  isProblemStatus,
  Problem,
  problem,
  problemContentType,
} from "@prayerteam/domain";
import createFetchClient, { type Middleware } from "openapi-fetch";
import createQueryHooks from "openapi-react-query";
import type { paths } from "./schema.ts";

export interface ApiClientOptions {
  // Prefix for every path, which already starts with /api. "" means
  // same-origin, as on the web behind CloudFront (ADR 0005).
  baseUrl: string;
  // The fetch to use; the app passes expo/fetch.
  fetch: typeof globalThis.fetch;
  // Sent on every request, so the API can tell an outdated native app to
  // update (ADR 0002).
  app: { version: string; platform: AppPlatform };
  // Called on any 426 upgrade_required.
  onUpgradeRequired: () => void;
}

// The response's Problem, or undefined if its body isn't one.
async function problemIn(response: Response): Promise<Problem | undefined> {
  const body: unknown = await response
    .clone()
    .json()
    .catch(() => undefined);
  const problem = Problem.safeParse(body);
  return problem.success ? problem.data : undefined;
}

// The one place the version and platform headers are set, and where a
// 426 upgrade_required is noticed, whichever call got it.
function appVersionCheck({ app, onUpgradeRequired }: ApiClientOptions): Middleware {
  return {
    onRequest({ request }) {
      request.headers.set(appVersionHeader, app.version);
      request.headers.set(appPlatformHeader, app.platform);
      return request;
    },
    async onResponse({ response }) {
      if ((await problemIn(response))?.code === "upgrade_required") {
        onUpgradeRequired();
      }
      return undefined;
    },
  };
}

// Puts a Problem in a Response: the client's adapter for problem+json.
function problemResponse(body: Problem): Response {
  return new Response(JSON.stringify(body), {
    status: body.status,
    headers: { "content-type": problemContentType },
  });
}

// Every failure reaches callers as a Problem (ADR 0002), so screens branch
// on `code`:
// - an error response whose body isn't a problem, such as a proxy's HTML
//   page, becomes one: not_found for a 404, internal_error with the same
//   status for a 5xx the catalogue lists, internal_error 502 for anything
//   else
// - a request that gets no response at all becomes a 503 internal_error
const errorsAsProblems: Middleware = {
  async onResponse({ response }) {
    if (response.ok || (await problemIn(response))) return undefined;
    const { status } = response;
    const detail = `The API answered with HTTP ${status}.`;
    if (status === 404) return problemResponse(problem("not_found", { detail }));
    return problemResponse(
      problem("internal_error", { detail, ...(isProblemStatus("internal_error", status) ? { status } : { status: 502 }) }),
    );
  },
  onError() {
    return problemResponse(problem("internal_error", { status: 503, detail: "The API could not be reached." }));
  },
};

// The typed client and its TanStack Query hooks. A call with a wrong path,
// parameter or body fails the type check, because the types are generated
// from the server's committed openapi.json.
export function createApiClient(options: ApiClientOptions) {
  const client = createFetchClient<paths>({ baseUrl: options.baseUrl, fetch: options.fetch });
  client.use(appVersionCheck(options), errorsAsProblems);
  return { client, query: createQueryHooks(client) };
}

export type ApiClient = ReturnType<typeof createApiClient>;

// TanStack Query's `retry`: a 4xx problem won't change on retry; anything
// else (5xx, or no response) gets two more tries.
export function retryUnlessClientError(failures: number, error: unknown): boolean {
  const problem = Problem.safeParse(error);
  const clientError = problem.success && problem.data.status < 500;
  return !clientError && failures < 2;
}
