import { afterEach } from "vitest";
import { buildApp, type App, type AppConfig } from "../src/app.ts";

// Builds an app from the factory for one test and closes it afterwards.
const open: App[] = [];
afterEach(async () => {
  await Promise.all(open.splice(0).map((app) => app.close()));
});

export async function testApp(config: Partial<AppConfig> = {}): Promise<App> {
  const app = await buildApp({ logger: false, ...config });
  open.push(app);
  return app;
}
