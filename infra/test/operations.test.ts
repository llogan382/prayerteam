import { describe, expect, it } from "vitest";
import { SSM_PREFIX } from "../src/settings.ts";
import { onlyResource, settings, synth } from "./stacks.ts";

const { data, app } = synth();

describe("logs", () => {
  it.each(Object.entries({ data, app }))("%s stack keeps every log group for 14 days", (_, template) => {
    for (const group of Object.values(template.findResources("AWS::Logs::LogGroup"))) {
      expect(group.Properties.RetentionInDays).toBe(14);
    }
  });

  it("defines the container and system log groups", () => {
    const names = Object.values(app.findResources("AWS::Logs::LogGroup")).map((g) => g.Properties.LogGroupName);
    expect(names).toEqual(expect.arrayContaining([`${SSM_PREFIX}/containers`, `${SSM_PREFIX}/system`]));
  });
});

describe("server image repository", () => {
  it("has immutable tags and keeps the last 10 images", () => {
    const repo = onlyResource(app, "AWS::ECR::Repository");
    expect(repo.ImageTagMutability).toBe("IMMUTABLE");
    const policy = JSON.parse(repo.LifecyclePolicy.LifecyclePolicyText);
    expect(policy.rules).toEqual([
      expect.objectContaining({
        selection: expect.objectContaining({ countType: "imageCountMoreThan", countNumber: 10 }),
        action: { type: "expire" },
      }),
    ]);
  });
});

describe("parameters", () => {
  it("creates none: every parameter is made by hand and only referenced", () => {
    for (const template of [data, app]) template.resourceCountIs("AWS::SSM::Parameter", 0);
  });
});

describe("GitHub deploy role", () => {
  const roles = Object.entries(app.findResources("AWS::IAM::Role")).filter(([, r]) =>
    JSON.stringify(r.Properties.AssumeRolePolicyDocument).includes("sts:AssumeRoleWithWebIdentity"),
  );

  it("can be assumed only by this repository's main branch", () => {
    expect(roles).toHaveLength(1);
    const statements = roles[0]![1].Properties.AssumeRolePolicyDocument.Statement;
    expect(statements).toHaveLength(1);
    expect(statements[0].Condition).toEqual({
      StringEquals: {
        "token.actions.githubusercontent.com:aud": "sts.amazonaws.com",
        "token.actions.githubusercontent.com:sub": `repo:${settings.githubRepo}:ref:refs/heads/main`,
      },
    });
  });

  it("can push images, run the deploy command, publish the web build and use the CDK roles, and nothing else", () => {
    const [roleId, role] = roles[0]!;
    expect(role.Properties.ManagedPolicyArns).toBeUndefined();
    const actions = Object.values(app.findResources("AWS::IAM::Policy"))
      .filter((p) => JSON.stringify(p.Properties.Roles).includes(roleId))
      .flatMap((p) => p.Properties.PolicyDocument.Statement as { Action: string | string[] }[])
      .flatMap((s) => [s.Action].flat());
    const services = new Set(actions.map((action) => action.split(":")[0]));
    expect([...services].sort()).toEqual(["cloudfront", "ecr", "s3", "ssm", "sts"]);
    // No parameter reads: the workflow gets names from the stack outputs.
    expect(actions.filter((a) => a.startsWith("ssm:")).sort()).toEqual([
      "ssm:GetCommandInvocation",
      "ssm:SendCommand",
    ]);
  });
});
