import { describe, expect, it } from "vitest";
import { ORIGIN_SECRET_HEADER } from "../src/app-stack.ts";
import { ORIGIN_SECRET_PARAMETER } from "../src/settings.ts";
import { settings, synth } from "./stacks.ts";

const { app } = synth();

function distributionConfig() {
  return Object.values(app.findResources("AWS::CloudFront::Distribution"))[0]!.Properties.DistributionConfig;
}
// The bucket CloudFront reads from, and the policy that lets it.
function cloudFrontBucketAndPolicy() {
  const policies = Object.values(app.findResources("AWS::S3::BucketPolicy")).filter((p) =>
    JSON.stringify(p.Properties.PolicyDocument).includes("cloudfront.amazonaws.com"),
  );
  expect(policies).toHaveLength(1);
  return { bucketId: policies[0]!.Properties.Bucket.Ref as string, policy: policies[0]!.Properties.PolicyDocument };
}

describe("web bucket", () => {
  it("blocks all public access", () => {
    const bucket = app.findResources("AWS::S3::Bucket")[cloudFrontBucketAndPolicy().bucketId]!;
    expect(bucket.Properties.PublicAccessBlockConfiguration).toEqual({
      BlockPublicAcls: true,
      BlockPublicPolicy: true,
      IgnorePublicAcls: true,
      RestrictPublicBuckets: true,
    });
  });

  it("can be read only by this distribution through OAC", () => {
    const [distributionId] = Object.keys(app.findResources("AWS::CloudFront::Distribution"));
    const allows = cloudFrontBucketAndPolicy().policy.Statement.filter((s: { Effect: string }) => s.Effect === "Allow");
    expect(allows).toEqual([
      expect.objectContaining({
        Principal: { Service: "cloudfront.amazonaws.com" },
        Action: "s3:GetObject",
        Condition: {
          StringEquals: {
            "AWS:SourceArn": expect.objectContaining({
              "Fn::Join": ["", expect.arrayContaining([{ Ref: distributionId }])],
            }),
          },
        },
      }),
    ]);
    app.resourceCountIs("AWS::CloudFront::OriginAccessControl", 1);
  });
});

describe("CloudFront", () => {
  it("serves the web domain", () => {
    expect(distributionConfig().Aliases).toEqual([settings.domain]);
  });

  it("sends /api/* uncached to the origin over HTTPS with every method, cookie, query and header but Host", () => {
    const config = distributionConfig();
    const api = config.CacheBehaviors.find((b: { PathPattern: string }) => b.PathPattern === "/api/*");
    expect(api.AllowedMethods).toEqual(expect.arrayContaining(["GET", "HEAD", "OPTIONS", "PUT", "PATCH", "POST", "DELETE"]));
    // AWS managed policies: CachingDisabled and AllViewerExceptHostHeader.
    expect(api.CachePolicyId).toBe("4135ea2d-6df8-44a3-9df3-4b5a84be39ad");
    expect(api.OriginRequestPolicyId).toBe("b689b0a8-53d0-40ab-baf2-68738e2966ac");
    expect(api.FunctionAssociations).toBeUndefined();

    const origin = config.Origins.find((o: { Id: string }) => o.Id === api.TargetOriginId);
    expect(origin.DomainName).toBe(settings.originDomain);
    expect(origin.CustomOriginConfig.OriginProtocolPolicy).toBe("https-only");
    expect(origin.OriginCustomHeaders).toEqual([
      { HeaderName: ORIGIN_SECRET_HEADER, HeaderValue: { "Fn::GetAtt": [expect.any(String), "Parameter.Value"] } },
    ]);
  });

  it("sends the pinned version of the origin secret SecureString, decrypted at deploy time", () => {
    const [reader] = Object.values(app.findResources("Custom::AWS"));
    const create = JSON.stringify(reader!.Properties.Create);
    expect(create).toContain('\\"action\\":\\"getParameter\\"');
    expect(create).toContain(`\\"Name\\":\\"${ORIGIN_SECRET_PARAMETER}:${settings.originSecretVersion}\\"`);
    expect(create).toContain('\\"WithDecryption\\":true');
  });

  it("rewrites app routes on the default behaviour with the SPA function", () => {
    const [functionId] = Object.keys(app.findResources("AWS::CloudFront::Function"));
    expect(distributionConfig().DefaultCacheBehavior.FunctionAssociations).toEqual([
      { EventType: "viewer-request", FunctionARN: { "Fn::GetAtt": [functionId, "FunctionARN"] } },
    ]);
  });

  it("never maps errors to the app shell", () => {
    expect(distributionConfig().CustomErrorResponses).toBeUndefined();
  });
});
