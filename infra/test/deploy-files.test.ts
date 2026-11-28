import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { ORIGIN_SECRET_HEADER } from "../src/app-stack.ts";
import { MIN_VERSION_PARAMETERS, SECURE_PARAMETERS, parameterName } from "../src/settings.ts";

// The files in deploy/ repeat a few names from the stacks, because bash,
// YAML and the Caddyfile can't import them. These keep the copies in step.
const deployFile = (path: string) => readFileSync(new URL(`../../deploy/${path}`, import.meta.url), "utf8");

describe("deploy files", () => {
  it("Caddy requires the same origin header that CloudFront sends", () => {
    expect(deployFile("caddy/Caddyfile")).toContain(`header ${ORIGIN_SECRET_HEADER} {$ORIGIN_SECRET}`);
  });

  it("the first-deploy checklist lists every hand-made parameter", () => {
    const readme = deployFile("README.md");
    for (const name of [...SECURE_PARAMETERS, ...MIN_VERSION_PARAMETERS]) {
      expect(readme).toContain(`\`${parameterName(name)}\``);
    }
  });
});
