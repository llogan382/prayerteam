// Type-level checks, run by `typecheck`: each @ts-expect-error fails the
// check if its call stops being an error, so a client that no longer
// follows the contract can't pass CI.
import type { ApiClient } from "../src/index.ts";

declare const api: ApiClient;

export async function calls() {
  const meta = await api.client.GET("/api/meta");
  const name: string | undefined = meta.data?.name;
  const code: string | undefined = meta.error?.code;

  await api.client.GET("/api/placeholder-items", { params: { query: { limit: 10 } } });

  // @ts-expect-error a path the API doesn't have
  await api.client.GET("/api/no-such-route");
  // @ts-expect-error a method the path doesn't have
  await api.client.POST("/api/meta");
  // @ts-expect-error a parameter of the wrong type
  await api.client.GET("/api/placeholder-items", { params: { query: { limit: "ten" } } });
  // @ts-expect-error a parameter the endpoint doesn't take
  await api.client.GET("/api/placeholder-items", { params: { query: { page: 2 } } });

  return { name, code };
}
