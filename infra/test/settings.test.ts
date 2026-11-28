import { describe, expect, it } from "vitest";
import { settingsFromContext } from "../src/settings.ts";
import { settings } from "./stacks.ts";

const { account, originSecretVersion, ...strings } = settings;
const context: Record<string, unknown> = strings;

describe("settings from CDK context", () => {
  it("reads every setting, with origin secret version 1 by default", () => {
    expect(settingsFromContext((key) => context[key], account)).toEqual(settings);
  });

  it("reads the origin secret version from `-c` as a string", () => {
    const withVersion: Record<string, unknown> = { ...context, originSecretVersion: "3" };
    expect(settingsFromContext((key) => withVersion[key], account).originSecretVersion).toBe(3);
  });

  it("names every missing or invalid setting", () => {
    const { domain, hostedZoneId, ...partial }: Record<string, unknown> = { ...strings, originSecretVersion: "latest" };
    expect(() => settingsFromContext((key) => partial[key], undefined)).toThrow(
      /Missing or invalid CDK settings: domain, hostedZoneId, account.*, originSecretVersion/,
    );
  });
});
