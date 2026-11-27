import { Match } from "aws-cdk-lib/assertions";
import { describe, expect, it } from "vitest";
import { CLOUDFRONT_ORIGIN_FACING_PREFIX_LIST } from "../src/data-stack.ts";
import { MIN_VERSION_PARAMETERS, SECURE_PARAMETERS, SSM_PREFIX } from "../src/settings.ts";
import { instanceRoleId, synth } from "./stacks.ts";

const { data, app, apiSecurityGroupId } = synth();

// Every inbound rule on the API group, whether CDK wrote it inline or as a
// separate SecurityGroupIngress resource.
function apiIngress() {
  const group = data.findResources("AWS::EC2::SecurityGroup")[apiSecurityGroupId]!;
  const separate = Object.values(data.findResources("AWS::EC2::SecurityGroupIngress"))
    .filter((r) => r.Properties.GroupId["Fn::GetAtt"]?.[0] === apiSecurityGroupId)
    .map((r) => r.Properties);
  const rules = [...(group.Properties.SecurityGroupIngress ?? []), ...separate] as Record<string, unknown>[];
  return rules.map(({ FromPort, ToPort, IpProtocol, CidrIp, CidrIpv6, SourcePrefixListId, SourceSecurityGroupId }) => ({
    IpProtocol,
    FromPort,
    ToPort,
    source: CidrIp ?? CidrIpv6 ?? SourcePrefixListId ?? SourceSecurityGroupId,
  }));
}

describe("API security group", () => {
  it("allows only 443 from the CloudFront origin-facing prefix list and 80 from anywhere", () => {
    expect(apiIngress()).toEqual(
      expect.arrayContaining([
        { IpProtocol: "tcp", FromPort: 443, ToPort: 443, source: CLOUDFRONT_ORIGIN_FACING_PREFIX_LIST },
        { IpProtocol: "tcp", FromPort: 80, ToPort: 80, source: "0.0.0.0/0" },
      ]),
    );
    expect(apiIngress()).toHaveLength(2);
  });

  it("has no SSH port", () => {
    const ssh = apiIngress().filter(
      (r) => r.IpProtocol === "-1" || ((r.FromPort as number) <= 22 && (r.ToPort as number) >= 22),
    );
    expect(ssh).toEqual([]);
  });
});

describe("API instance", () => {
  it("requires IMDSv2, encrypts its volume and has no key pair", () => {
    app.hasResourceProperties("AWS::EC2::Instance", {
      KeyName: Match.absent(),
      BlockDeviceMappings: [{ Ebs: Match.objectLike({ Encrypted: true, VolumeType: "gp3" }) }],
    });
    app.hasResourceProperties("AWS::EC2::Instance", {
      // Hop limit 2 lets containers reach IMDSv2 through Docker's bridge.
      MetadataOptions: Match.objectLike({ HttpTokens: "required", HttpPutResponseHopLimit: 2 }),
    });
  });

  it("has an Elastic IP associated", () => {
    const [instanceId] = Object.keys(app.findResources("AWS::EC2::Instance"));
    app.hasResourceProperties("AWS::EC2::EIPAssociation", {
      InstanceId: { Ref: instanceId },
      AllocationId: Match.anyValue(),
    });
  });

  it("recovers itself when its system status check fails", () => {
    app.hasResourceProperties("AWS::CloudWatch::Alarm", {
      MetricName: "StatusCheckFailed_System",
      AlarmActions: [{ "Fn::Join": ["", Match.arrayWith([Match.stringLikeRegexp(":automate:.*:ec2:recover$")])] }],
    });
  });

  it("is patched weekly with reboot if needed", () => {
    app.hasResourceProperties("AWS::SSM::MaintenanceWindow", { Schedule: Match.stringLikeRegexp("SUN") });
    app.hasResourceProperties("AWS::SSM::MaintenanceWindowTask", {
      TaskArn: "AWS-RunPatchBaseline",
      TaskInvocationParameters: {
        MaintenanceWindowRunCommandParameters: {
          Parameters: { Operation: ["Install"], RebootOption: ["RebootIfNeeded"] },
        },
      },
    });
  });
});

describe("instance role", () => {
  const roleId = instanceRoleId(app);
  const role = app.findResources("AWS::IAM::Role")[roleId]!;
  const statements = Object.values(app.findResources("AWS::IAM::Policy"))
    .filter((p) => JSON.stringify(p.Properties.Roles).includes(roleId))
    .flatMap((p) => p.Properties.PolicyDocument.Statement as Record<string, unknown>[]);
  const actionsOf = (s: Record<string, unknown>) => [s.Action].flat() as string[];
  const isStar = (resource: unknown) => resource === "*" || (Array.isArray(resource) && resource.includes("*"));

  it("has only the managed policy Session Manager requires", () => {
    // AmazonSSMManagedInstanceCore is AWS's minimum for Session Manager, Run
    // Command and Patch Manager; its wide SSM reads are denied below.
    expect(role.Properties.ManagedPolicyArns).toHaveLength(1);
    expect(JSON.stringify(role.Properties.ManagedPolicyArns)).toContain(
      ':iam::aws:policy/AmazonSSMManagedInstanceCore"',
    );
  });

  it("grants ECR, SSM, Secrets Manager and SES actions only on specific resources", () => {
    // ecr:GetAuthorizationToken has no resource-level permissions.
    const starred = statements
      .filter((s) => s.Effect === "Allow" && isStar(s.Resource))
      .flatMap(actionsOf)
      .filter((a) => ["ecr", "ssm", "secretsmanager", "ses"].includes(a.split(":")[0]!))
      .filter((a) => a !== "ecr:GetAuthorizationToken");
    expect(statements.length).toBeGreaterThan(0);
    expect(starred).toEqual([]);
  });

  it("reads exactly the hand-made parameters, by name", () => {
    const allow = statements.find((s) => s.Effect === "Allow" && actionsOf(s).includes("ssm:GetParameter"))!;
    const names = JSON.stringify(allow.Resource);
    for (const name of [...SECURE_PARAMETERS, ...MIN_VERSION_PARAMETERS]) {
      expect(names).toContain(`:parameter${SSM_PREFIX}/${name}"`);
    }
    expect(names).not.toContain("*");
  });

  it("cannot read any other SSM parameter, despite the Session Manager managed policy", () => {
    const deny = statements.find(
      (s) => s.Effect === "Deny" && actionsOf(s).includes("ssm:GetParameter") && s.NotResource,
    );
    expect(deny).toBeDefined();
    expect(actionsOf(deny!)).toEqual(
      expect.arrayContaining(["ssm:GetParameter", "ssm:GetParameters", "ssm:GetParametersByPath"]),
    );
    const allow = statements.find((s) => s.Effect === "Allow" && actionsOf(s).includes("ssm:GetParameter"))!;
    expect(deny!.NotResource).toEqual(allow.Resource);
  });
});
