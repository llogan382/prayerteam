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
}

export const REGION = 'us-east-1';
export const SSM_PREFIX = '/prayerteam/prod';

const required = ['domain', 'originDomain', 'hostedZoneId', 'hostedZoneName', 'githubRepo'] as const;

export function settingsFromContext(
  getContext: (key: string) => unknown,
  account: string | undefined,
): Settings {
  const missing: string[] = required.filter((key) => typeof getContext(key) !== 'string');
  if (!account) missing.push('account (set CDK_DEFAULT_ACCOUNT or sign in to AWS)');
  if (missing.length > 0) {
    throw new Error(`Missing CDK settings: ${missing.join(', ')}`);
  }
  const value = (key: (typeof required)[number]) => getContext(key) as string;
  return {
    account: account as string,
    domain: value('domain'),
    originDomain: value('originDomain'),
    hostedZoneId: value('hostedZoneId'),
    hostedZoneName: value('hostedZoneName'),
    githubRepo: value('githubRepo'),
  };
}
