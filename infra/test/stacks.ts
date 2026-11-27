import { App, type CfnElement, Stack } from "aws-cdk-lib";
import { Match, Template } from "aws-cdk-lib/assertions";
import { expect } from "vitest";
import type { Settings } from "../src/settings.ts";
import { createStacks } from "../src/stacks.ts";

export const settings: Settings = {
  account: "111111111111",
  domain: "prayer.example.org",
  originDomain: "origin.prayer.example.org",
  hostedZoneId: "Z0123456789ABC",
  hostedZoneName: "example.org",
  githubRepo: "llogan382/prayerteam",
  originSecretVersion: 1,
};

export function synth() {
  const app = new App();
  const stacks = createStacks(app, settings);
  const logicalId = (stack: Stack, element: unknown) => stack.getLogicalId(element as CfnElement);
  return {
    data: Template.fromStack(stacks.data),
    app: Template.fromStack(stacks.app),
    apiSecurityGroupId: logicalId(stacks.data, stacks.data.apiSecurityGroup.node.defaultChild),
  };
}

// The properties of the template's single resource of a type.
export function onlyResource(template: Template, type: string) {
  const resources = Object.values(template.findResources(type));
  expect(resources).toHaveLength(1);
  return resources[0]!.Properties;
}

// The logical ID of the API instance's role.
export function instanceRoleId(app: Template): string {
  const roles = Object.keys(
    app.findResources("AWS::IAM::Role", {
      Properties: {
        AssumeRolePolicyDocument: Match.objectLike({
          Statement: [Match.objectLike({ Principal: { Service: "ec2.amazonaws.com" } })],
        }),
      },
    }),
  );
  expect(roles).toHaveLength(1);
  return roles[0]!;
}
