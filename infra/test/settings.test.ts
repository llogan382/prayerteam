import { describe, expect, it } from 'vitest';
import { settingsFromContext } from '../src/settings.ts';

const context: Record<string, string> = {
  domain: 'prayer.example.org',
  originDomain: 'origin.prayer.example.org',
  hostedZoneId: 'Z0123456789ABC',
  hostedZoneName: 'example.org',
  githubRepo: 'llogan382/prayerteam',
};

describe('settings from CDK context', () => {
  it('reads every setting', () => {
    expect(settingsFromContext((key) => context[key], '111111111111')).toEqual({
      ...context,
      account: '111111111111',
    });
  });

  it('names every missing setting', () => {
    const { domain, hostedZoneId, ...partial } = context;
    expect(() => settingsFromContext((key) => partial[key], undefined)).toThrow(
      /Missing CDK settings: domain, hostedZoneId, account/,
    );
  });
});
