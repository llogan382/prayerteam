import { App } from 'aws-cdk-lib';
import { Template } from 'aws-cdk-lib/assertions';
import type { Settings } from '../src/settings.ts';
import { createStacks } from '../src/stacks.ts';

export const settings: Settings = {
  account: '111111111111',
  domain: 'prayer.example.org',
  originDomain: 'origin.prayer.example.org',
  hostedZoneId: 'Z0123456789ABC',
  hostedZoneName: 'example.org',
  githubRepo: 'llogan382/prayerteam',
};

export function synth() {
  const app = new App();
  const stacks = createStacks(app, settings);
  return {
    data: Template.fromStack(stacks.data),
    app: Template.fromStack(stacks.app),
  };
}
