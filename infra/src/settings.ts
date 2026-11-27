// Values that differ per environment come from CDK context (cdk.json or
// `-c key=value`), never from hard-coded strings in the stacks.
export interface Settings {
  account: string;
  // The web domain people open in a browser, served by CloudFront.
  domain: string;
  // The instance's own hostname, used only by CloudFront and Let's Encrypt.
  originDomain: string;
  // The existing Route 53 hosted zone both names live in.
  hostedZoneId: string;
  hostedZoneName: string;
  // owner/name of the GitHub repository allowed to deploy from `main`.
  githubRepo: string;
  // The Parameter Store version of the CloudFront origin secret that
  // CloudFront sends. Bump it after putting a new value (deploy/README.md).
  originSecretVersion: number;
}

export const REGION = "us-east-1";
export const SSM_PREFIX = "/prayerteam/prod";

// Parameters created by hand once (deploy/README.md lists them); the stacks
// only reference their names. CloudFormation can't create SecureStrings, and
// a stack-owned min-version would be reset by a later stack update.
export const SECURE_PARAMETERS = [
  "better-auth-secret",
  "expo-access-token",
  "vapid-public-key",
  "vapid-private-key",
  "cloudfront-origin-secret",
] as const;
export const MIN_VERSION_PARAMETERS = ["min-version/ios", "min-version/android"] as const;
export const ORIGIN_SECRET_PARAMETER = `${SSM_PREFIX}/cloudfront-origin-secret`;

export function parameterName(name: string): string {
  return `${SSM_PREFIX}/${name}`;
}

const required = ["domain", "originDomain", "hostedZoneId", "hostedZoneName", "githubRepo"] as const;

export function settingsFromContext(
  getContext: (key: string) => unknown,
  account: string | undefined,
): Settings {
  const missing: string[] = required.filter((key) => typeof getContext(key) !== "string");
  if (!account) missing.push("account (set CDK_DEFAULT_ACCOUNT or sign in to AWS)");
  // `-c originSecretVersion=2` arrives as a string, cdk.json as a number.
  const originSecretVersion = Number(getContext("originSecretVersion") ?? 1);
  if (!Number.isInteger(originSecretVersion) || originSecretVersion < 1) {
    missing.push("originSecretVersion (a positive integer)");
  }
  if (missing.length > 0) {
    throw new Error(`Missing or invalid CDK settings: ${missing.join(", ")}`);
  }
  const contextString = (key: (typeof required)[number]) => getContext(key) as string;
  return {
    account: account as string,
    domain: contextString("domain"),
    originDomain: contextString("originDomain"),
    hostedZoneId: contextString("hostedZoneId"),
    hostedZoneName: contextString("hostedZoneName"),
    githubRepo: contextString("githubRepo"),
    originSecretVersion,
  };
}
