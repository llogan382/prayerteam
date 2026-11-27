import type { App } from "aws-cdk-lib";
import { AppStack } from "./app-stack.ts";
import { DataStack } from "./data-stack.ts";
import { REGION, type Settings } from "./settings.ts";

// The production environment: one data stack and one app stack, split by
// lifecycle (ADR 0005).
export function createStacks(app: App, settings: Settings) {
  const env = { account: settings.account, region: REGION };
  const data = new DataStack(app, "PrayerTeamData", { env, settings });
  const appStack = new AppStack(app, "PrayerTeamApp", { env, settings, data });
  return { data, app: appStack };
}
