import { describe, expect, it } from 'vitest';
import { settings, synth } from './stacks.ts';

const templates = synth();

describe('logs', () => {
  it.each(Object.entries(templates))('%s stack keeps every log group for 14 days', (_, template) => {
    for (const group of Object.values(template.findResources('AWS::Logs::LogGroup'))) {
      expect(group.Properties.RetentionInDays).toBe(14);
    }
  });

  it('defines the container and system log groups', () => {
    expect(Object.keys(templates.app.findResources('AWS::Logs::LogGroup'))).toHaveLength(2);
  });
});

describe('server image repository', () => {
  it('has immutable tags and keeps the last 10 images', () => {
    const repo = Object.values(templates.app.findResources('AWS::ECR::Repository'))[0]!;
    expect(repo.Properties.ImageTagMutability).toBe('IMMUTABLE');
    const policy = JSON.parse(repo.Properties.LifecyclePolicy.LifecyclePolicyText);
    expect(policy.rules).toEqual([
      expect.objectContaining({
        selection: expect.objectContaining({ countType: 'imageCountMoreThan', countNumber: 10 }),
        action: { type: 'expire' },
      }),
    ]);
  });
});

describe('GitHub deploy role', () => {
  it('can be assumed only by this repository\'s main branch', () => {
    const roles = Object.values(templates.app.findResources('AWS::IAM::Role')).filter((r) =>
      JSON.stringify(r.Properties.AssumeRolePolicyDocument).includes('sts:AssumeRoleWithWebIdentity'),
    );
    expect(roles).toHaveLength(1);
    const statements = roles[0]!.Properties.AssumeRolePolicyDocument.Statement;
    expect(statements).toHaveLength(1);
    expect(statements[0].Condition).toEqual({
      StringEquals: {
        'token.actions.githubusercontent.com:aud': 'sts.amazonaws.com',
        'token.actions.githubusercontent.com:sub': `repo:${settings.githubRepo}:ref:refs/heads/main`,
      },
    });
  });
});
